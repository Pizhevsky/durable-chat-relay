import type { DeviceId } from '../../../shared/types'
import { clientConfig } from '../config/clientConfig'

export function getDeviceId(): DeviceId {
  const params = new URLSearchParams(window.location.search)
  if (params.get(clientConfig.newDeviceQueryParam) === '1') {
    sessionStorage.removeItem(clientConfig.storageKeys.deviceId)
    sessionStorage.removeItem(clientConfig.storageKeys.logicalClock)
    params.delete(clientConfig.newDeviceQueryParam)
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
  }

  const existing = sessionStorage.getItem(clientConfig.storageKeys.deviceId)
  if (existing) return existing

  const deviceId = `browser-${crypto.randomUUID()}`
  sessionStorage.setItem(clientConfig.storageKeys.deviceId, deviceId)
  return deviceId
}
