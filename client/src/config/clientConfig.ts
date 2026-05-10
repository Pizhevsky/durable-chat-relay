export const clientConfig = {
  apiOverrideQueryParam: 'api',
  apiOverrideStorageKey: 'durable-chat-api',
  devClientPort: '1234',
  devApiPort: '3000',
  devHelperApiPort: '3001',
  defaultIceServers: [{ urls: 'stun:stun.l.google.com:19302' }] satisfies RTCIceServer[]
}
