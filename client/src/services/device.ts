import type { DeviceId } from '../../../shared/types'
import { clientConfig } from '../config/clientConfig'

export function getDeviceId(): DeviceId {
  const existing = localStorage.getItem(clientConfig.storageKeys.deviceId)
  if (existing) return existing

  const deviceId = `browser-${crypto.randomUUID()}`
  localStorage.setItem(clientConfig.storageKeys.deviceId, deviceId)
  return deviceId
}
