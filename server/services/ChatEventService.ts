import type Database from 'better-sqlite3'
import type {
  ChatEvent,
  ChatId,
  EventId,
  NodeRole,
  UserId
} from '../../shared/types.js'
import { AppError } from '../errors.js'
import { DirectChatReconciler } from './DirectChatReconciler.js'
import { ChatEventProjector } from './ChatEventProjector.js'
import { ChatReadModel } from './ChatReadModel.js'
import { ChatEventStore } from './ChatEventStore.js'
import { SyncStateStore } from './SyncStateStore.js'
import { validateChatEvent } from './ChatEventValidator.js'
import { normaliseIncomingStatus } from './chatEventFormatters.js'

export class ChatEventService {
  private readonly directChatReconciler: DirectChatReconciler
  private readonly eventStore: ChatEventStore
  private readonly projector: ChatEventProjector
  private readonly readModel: ChatReadModel
  private readonly syncStateStore: SyncStateStore

  constructor(
    private readonly db: Database.Database,
    private readonly nodeRole: NodeRole
  ) {
    this.eventStore = new ChatEventStore(db)
    this.directChatReconciler = new DirectChatReconciler(db, nodeRole, (event) => this.eventStore.storeEvent(event))
    this.projector = new ChatEventProjector(db)
    this.readModel = new ChatReadModel(db)
    this.syncStateStore = new SyncStateStore(db)
  }

  listUsers() {
    return this.readModel.listUsers()
  }

  listChats(userId: UserId) {
    return this.readModel.listChats(userId)
  }

  listMessages(chatId: ChatId, userId: UserId) {
    if (!this.getActiveMemberIds(chatId).includes(userId)) {
      throw new AppError('User is not an active chat member', 403, 'NOT_CHAT_MEMBER')
    }

    return this.readModel.listMessages(chatId)
  }

  getActiveMemberIds(chatId: ChatId): UserId[] {
    return this.readModel.getActiveMemberIds(chatId)
  }

  usersShareActiveChat(firstUserId: UserId, secondUserId: UserId): boolean {
    return this.readModel.usersShareActiveChat(firstUserId, secondUserId)
  }

  applyEvent(event: ChatEvent): { event: ChatEvent; inserted: boolean } {
    validateChatEvent(event)

    if (this.eventStore.hasEvent(event.eventId)) {
      return { event: this.eventStore.getById(event.eventId), inserted: false }
    }

    const syncStatus = this.nodeRole === 'central'
      ? 'central-synced'
      : normaliseIncomingStatus(event.syncStatus, this.nodeRole)
    const eventToStore: ChatEvent = { ...event, syncStatus }
    const existingDirectChatEvent = this.directChatReconciler.findDuplicateCreatedEvent(eventToStore)
    if (existingDirectChatEvent) {
      if (this.directChatReconciler.shouldRemapToAuthoritative(eventToStore, existingDirectChatEvent)) {
        this.directChatReconciler.remapLocalDirectChat(existingDirectChatEvent.chatId, eventToStore)

        return { event: eventToStore, inserted: false }
      }

      return { event: existingDirectChatEvent, inserted: false }
    }

    const transaction = this.db.transaction(() => {
      this.eventStore.storeEvent(eventToStore)
      this.projector.projectEvent(eventToStore)
    })

    transaction()

    return { event: eventToStore, inserted: true }
  }

  applyEvents(events: ChatEvent[]): {
    accepted: EventId[]
    duplicates: EventId[]
    conflicts: EventId[]
    serverEvents: ChatEvent[]
  } {
    const accepted: EventId[] = []
    const duplicates: EventId[] = []
    const conflicts: EventId[] = []
    const serverEvents: ChatEvent[] = []
    const chatIdAliases = new Map<ChatId, ChatId>()

    for (const originalEvent of events) {
      const event = this.directChatReconciler.withChatIdAlias(originalEvent, chatIdAliases)
      try {
        const result = this.applyEvent(event)
        serverEvents.push(result.event)
        if (result.inserted) accepted.push(event.eventId)
        else duplicates.push(event.eventId)

        if (this.directChatReconciler.isDirectChatCreated(event) && result.event.chatId !== event.chatId) {
          chatIdAliases.set(event.chatId, result.event.chatId)
        }
      } catch (_error) {
        conflicts.push(event.eventId)
      }
    }

    return { accepted, duplicates, conflicts, serverEvents }
  }

  getEventsSince(sequence: number, limit = 1000): ChatEvent[] {
    return this.eventStore.getSince(sequence, limit)
  }

  getEventSequence(eventId: EventId): number {
    return this.eventStore.getSequence(eventId)
  }

  getCurrentSequence(): number {
    return this.eventStore.getCurrentSequence()
  }

  getPendingCentralSync(limit = 100): ChatEvent[] {
    return this.eventStore.getPendingCentralSync(limit)
  }

  markCentralSynced(eventIds: EventId[]): void {
    this.eventStore.markCentralSynced(eventIds)
  }

  markCentralConflicted(eventIds: EventId[]): void {
    this.eventStore.markCentralConflicted(eventIds)
  }

  getSyncCursor(key: string): number {
    return this.syncStateStore.getCursor(key)
  }

  setSyncCursor(key: string, value: number): void {
    this.syncStateStore.setCursor(key, value)
  }

  exportEvents(): ChatEvent[] {
    return this.getEventsSince(0)
  }

}
