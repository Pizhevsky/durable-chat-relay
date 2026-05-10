import type { DeviceId } from '../../../shared/types'

const DEVICE_ID_KEY = 'resilient-field-chat-device-id'

export function getDeviceId(): DeviceId {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing

  const deviceId = `browser-${crypto.randomUUID()}`
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}
