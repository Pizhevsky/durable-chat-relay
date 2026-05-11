import { clientConfig } from '../config/clientConfig'

export function shortDeviceId(deviceId: string): string {
  const length = clientConfig.deviceIdPreviewLength
  return deviceId.length > length ? `${deviceId.slice(0, length)}...` : deviceId
}
