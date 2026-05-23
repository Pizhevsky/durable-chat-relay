import type {
  ChatEvent,
  ChatEventPayload,
  ChatEventType,
  ChatId,
  DeviceId,
  EventSyncStatus,
  NodeId,
  UserId
} from '../../../shared/types'
import { clientConfig } from '../config/clientConfig'
import { nowIso } from '../utils/dates'

export function createChatEvent<TPayload extends ChatEventPayload>(input: {
  nodeId: NodeId
  deviceId: DeviceId
  actorUserId: UserId
  chatId: ChatId
  type: ChatEventType
  payload: TPayload
  syncStatus?: EventSyncStatus
}): ChatEvent<TPayload> {
  const logicalClock = nextLogicalClock()

  return {
    eventId: `${input.deviceId}:${crypto.randomUUID()}`,
    originNodeId: input.nodeId,
    originDeviceId: input.deviceId,
    actorUserId: input.actorUserId,
    chatId: input.chatId,
    type: input.type,
    payload: input.payload,
    createdAt: nowIso(),
    logicalClock,
    syncStatus: input.syncStatus ?? 'local'
  }
}

function nextLogicalClock(): number {
  const logicalClock = Number(sessionStorage.getItem(clientConfig.storageKeys.logicalClock) ?? 0) + 1
  sessionStorage.setItem(clientConfig.storageKeys.logicalClock, String(logicalClock))
  return logicalClock
}
