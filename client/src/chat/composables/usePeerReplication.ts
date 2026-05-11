import type { Ref } from 'vue'
import type { PeerSignalPayload, UserId } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import { createPeerMesh } from '../../services/realtime/peerMesh'
import {
  peerSyncEvents,
  peerSyncEventsById,
  recordPeerAck,
  savePeerEvent
} from '../../storage/localDb'
import { uniqueUserIds } from '../../utils/chatIdentity'
import { errorMessage } from '../errorMessage'
import { canAcceptPeerEvent, peerTargetUserIds, peerTargetUserIdsFromEvents } from '../events/peerEventRouting'
import type { useChatState } from './useChatState'

type ChatState = ReturnType<typeof useChatState>
type AppliedChatEvent = Parameters<ChatState['applyEvent']>[0]
type PeerSignalMessage = Parameters<ReturnType<typeof createPeerMesh>['handleSignal']>[0]

interface PeerReplicationOptions {
  state: ChatState
  deviceId: string
  localTransportPaused: Ref<boolean>
  sendSignal: (toUserId: UserId, signal: PeerSignalPayload) => void
  onEventAccepted: (event: AppliedChatEvent) => Promise<void>
}

export function usePeerReplication({
  state,
  deviceId,
  localTransportPaused,
  sendSignal,
  onEventAccepted
}: PeerReplicationOptions) {
  const peerMesh = createPeerMesh({
    currentUserId: () => state.currentUserId.value,
    deviceId,
    sendSignal,
    getEventsForPeer: async (peerUserId) => peerEventsForUser(peerUserId, { recentOnly: true }),
    getEventsByIdsForPeer: async (eventIds, peerUserId) => peerEventsForUser(peerUserId, { eventIds }),
    getTargetUserIds: (event) => peerTargetUserIds(state.chats.value, state.currentUserId.value, event),
    onEvent: (event, fromDeviceId) => {
      const canAccept = canAcceptPeerEvent(state.chats.value, state.currentUserId.value, event)
      if (!canAccept) return false

      return savePeerEvent(event, fromDeviceId)
        .then(async () => {
          await onEventAccepted(event)
          return true
        })
        .catch((error: unknown) => {
          state.lastError.value = errorMessage(error, 'Failed to apply WebRTC event')
          return false
        })
    },
    onPeerAck: (eventId, peerDeviceId) => {
      state.peerAckCount.value += 1
      recordPeerAck(eventId, peerDeviceId).catch(() => undefined)
    },
    onPeerEvent: (event) => {
      state.lastPeerEventType.value = event.type
    },
    onMissingSync: (status) => {
      state.peerMissingSyncStatus.value = status
    },
    onStatus: (status) => {
      state.peerStatus.value = status
      if (localTransportPaused.value) state.connectionLabel.value = status
    }
  })

  function currentPeerTargetIds(): UserId[] {
    const directoryPeerIds = state.peerDirectory.value
      .filter((peer) => peer.isOnline)
      .map((peer) => peer.userId)

    const fallbackChatMemberIds = state.chats.value.flatMap((chat) =>
      chat.members
        .filter((member) => !member.leftAt)
        .map((member) => member.userId)
    )

    return uniqueUserIds(directoryPeerIds.length > 0 ? directoryPeerIds : fallbackChatMemberIds)
  }

  function syncTargets(): void {
    peerMesh.updatePeers(currentPeerTargetIds())
  }

  function publishEvent(event: AppliedChatEvent): void {
    const targetUserIds = peerTargetUserIds(state.chats.value, state.currentUserId.value, event)
    peerMesh.publishEvent(event, targetUserIds)
  }

  function handleSignal(message: PeerSignalMessage): Promise<void> {
    const directoryHasLoaded = state.peerDirectory.value.length > 0
    if (directoryHasLoaded && !currentPeerTargetIds().includes(message.fromUserId)) return Promise.resolve()
    return peerMesh.handleSignal(message)
  }

  function resetForUserChange(): void {
    peerMesh.close()
    state.setPeerDirectory([])
    state.peerAckCount.value = 0
    state.peerMissingSyncStatus.value = 'idle'
    state.lastPeerEventType.value = 'none'
    state.peerStatus.value = 'Peer fallback: rebuilding for selected user'
  }

  function close(): void {
    peerMesh.close()
  }

  async function peerEventsForUser(
    peerUserId: string,
    options: { eventIds?: string[]; recentOnly?: boolean } = {}
  ): Promise<AppliedChatEvent[]> {
    const events = options.eventIds ? await peerSyncEventsById(options.eventIds) : await peerSyncEvents()
    const targetableEvents = events
      .filter((event) =>
        peerTargetUserIdsFromEvents(state.chats.value, state.currentUserId.value, event, events).includes(peerUserId)
      )

    return options.recentOnly ? targetableEvents.slice(-clientConfig.peer.syncEventLimit) : targetableEvents
  }

  return {
    syncTargets,
    publishEvent,
    handleSignal,
    resetForUserChange,
    close
  }
}
