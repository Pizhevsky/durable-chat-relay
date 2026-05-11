import { clientConfig } from '../config/clientConfig'

export function apiOrigin(): string {
  const urlOverride = new URLSearchParams(window.location.search).get(clientConfig.apiOverrideQueryParam)
  if (urlOverride) {
    localStorage.setItem(clientConfig.storageKeys.apiOverride, normaliseApiOrigin(urlOverride))
  }

  const storedOverride = localStorage.getItem(clientConfig.storageKeys.apiOverride)
  if (storedOverride) return normaliseApiOrigin(storedOverride)

  if (window.location.port === clientConfig.devClientPort) {
    return `${window.location.protocol}//${window.location.hostname}:${clientConfig.devApiPort}`
  }

  return window.location.origin
}

export function apiUrl(path: string): string {
  return new URL(path, apiOrigin()).toString()
}

function normaliseApiOrigin(value: string): string {
  const url = new URL(value, window.location.origin)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API override must use http or https')
  }
  return url.origin
}
