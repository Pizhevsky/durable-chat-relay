import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatId,
  MessageCreatedPayload,
  UserId
} from '../../shared/types'

type EventOverrides<TPayload> = Omit<Partial<ChatEvent<TPayload>>, 'payload'> & {
  payload?: Partial<TPayload>
}

export function chatCreatedEvent(
  overrides: EventOverrides<ChatCreatedPayload> = {}
): ChatEvent<ChatCreatedPayload> {
  const chatId = overrides.chatId ?? overrides.payload?.chatId ?? 'chat-test'
  const actorUserId = overrides.actorUserId ?? 'u-denis'
  const memberIds = overrides.payload?.memberIds ?? ['u-denis', 'u-anna']
  const payload: ChatCreatedPayload = {
    chatId,
    clientChatId: chatId,
    type: 'direct',
    memberIds,
    ...overrides.payload
  }

  return {
    eventId: `device-test:${crypto.randomUUID()}`,
    originNodeId: 'browser-test',
    originDeviceId: 'device-test',
    actorUserId,
    chatId,
    type: 'chat.created',
    createdAt: '2026-01-01T00:00:00.000Z',
    logicalClock: 1,
    syncStatus: 'local',
    ...overrides,
    payload
  }
}

export function messageCreatedEvent(
  overrides: EventOverrides<MessageCreatedPayload> = {}
): ChatEvent<MessageCreatedPayload> {
  const chatId = overrides.chatId ?? overrides.payload?.chatId ?? 'chat-test'
  const messageId = overrides.payload?.messageId ?? `msg-${crypto.randomUUID()}`
  const payload: MessageCreatedPayload = {
    messageId,
    clientMessageId: messageId,
    chatId,
    text: 'Test message',
    ...overrides.payload
  }

  return {
    eventId: `device-test:${crypto.randomUUID()}`,
    originNodeId: 'browser-test',
    originDeviceId: 'device-test',
    actorUserId: overrides.actorUserId ?? 'u-denis',
    chatId,
    type: 'message.created',
    createdAt: '2026-01-01T00:00:01.000Z',
    logicalClock: 2,
    syncStatus: 'local',
    ...overrides,
    payload
  }
}

export function directChat(
  chatId: ChatId,
  firstUserId: UserId = 'u-denis',
  secondUserId: UserId = 'u-anna'
): ChatEvent<ChatCreatedPayload> {
  return chatCreatedEvent({
    chatId,
    actorUserId: firstUserId,
    payload: {
      chatId,
      clientChatId: chatId,
      type: 'direct',
      memberIds: [firstUserId, secondUserId]
    }
  })
}
