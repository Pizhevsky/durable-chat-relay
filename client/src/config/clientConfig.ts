export const clientConfig = {
  apiOverrideQueryParam: 'api',
  devClientPort: '1234',
  devApiPort: '3000',
  devHelperApiPort: '3001',
  newDeviceQueryParam: 'newDevice',
  storageKeys: {
    apiOverride: 'durable-chat-api',
    apiOverrideSource: 'durable-chat-api-source',
    deviceId: 'durable-chat-device-id',
    selectedUserId: 'durable-chat-user',
    logicalClock: 'durable-chat-clock',
    localOnlySession: 'durable-chat-local-only'
  },
  localEventChannelName: 'durable-chat-events',
  localDbName: 'durable-chat',
  defaultUserId: 'u-denis',
  browserNodeIdPrefixLength: 8,
  deviceIdPreviewLength: 16,
  notifications: {
    statusMessageMs: 5000,
    inAppMessageMs: 5000
  },
  peer: {
    maxSeenEvents: 2_000,
    maxPendingSignals: 100,
    syncEventLimit: 500,
    defaultIceServers: [{ urls: 'stun:stun.l.google.com:19302' }] satisfies RTCIceServer[]
  },
  syncedEventRetentionMs: 24 * 60 * 60 * 1000,
  syncedEventMinKeep: 200,
  maxEventRetryCount: 5,
  devCentralReconnectProbeMs: 5000,
  demo: {
    maxAlternateUserButtons: 3,
    userWindowFeatures: 'width=1100,height=850'
  }
}
