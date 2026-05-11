import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatSummary,
  MemberChangedPayload,
  UserId
} from '../../../../shared/types'
import { uniqueUserIds } from '../../utils/chatIdentity'

export function peerTargetUserIds(chats: ChatSummary[], currentUserId: UserId, event: ChatEvent): UserId[] {
  const memberIds = event.type === 'chat.created'
    ? chatCreatedMemberIds(event as ChatEvent<ChatCreatedPayload>)
    : eventMemberIds(chats, event)

  return uniqueUserIds(memberIds).filter((userId) => userId !== currentUserId)
}

export function peerTargetUserIdsFromEvents(
  chats: ChatSummary[],
  currentUserId: UserId,
  event: ChatEvent,
  events: ChatEvent[]
): UserId[] {
  const directTargets = peerTargetUserIds(chats, currentUserId, event)
  if (directTargets.length > 0) return directTargets

  const chatCreated = events.find((item): item is ChatEvent<ChatCreatedPayload> =>
    item.chatId === event.chatId && item.type === 'chat.created'
  )
  if (!chatCreated) return []

  return uniqueUserIds(chatCreatedMemberIds(chatCreated)).filter((userId) => userId !== currentUserId)
}

export function canAcceptPeerEvent(chats: ChatSummary[], currentUserId: UserId, event: ChatEvent): boolean {
  if (event.type === 'chat.created') {
    return chatCreatedMemberIds(event as ChatEvent<ChatCreatedPayload>).includes(currentUserId)
  }

  const chat = chats.find((item) => item.id === event.chatId)
  return Boolean(chat?.members.some((member) => member.userId === currentUserId && !member.leftAt))
}

function chatCreatedMemberIds(event: ChatEvent<ChatCreatedPayload>): UserId[] {
  return uniqueUserIds([event.actorUserId, ...event.payload.memberIds])
}

function eventMemberIds(chats: ChatSummary[], event: ChatEvent): UserId[] {
  const chat = chats.find((item) => item.id === event.chatId)
  const activeMemberIds = chat?.members
    .filter((member) => !member.leftAt)
    .map((member) => member.userId) ?? []

  if (event.type === 'member.added' || event.type === 'member.removed') {
    const payload = event.payload as MemberChangedPayload
    return [...activeMemberIds, payload.memberId]
  }

  return activeMemberIds
}
