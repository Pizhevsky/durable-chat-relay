import { clientConfig } from '../config/clientConfig'

const automaticDevHelperSource = 'auto-dev-helper'
const manualOverrideSource = 'manual'

export function apiOrigin(): string {
  const urlOverride = new URLSearchParams(window.location.search).get(clientConfig.apiOverrideQueryParam)
  if (urlOverride) {
    storeApiOverride(urlOverride)
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

export function canFallbackToDevHelper(origin: string): boolean {
  return window.location.port === clientConfig.devClientPort &&
    origin === devApiOrigin(clientConfig.devApiPort) &&
    !localStorage.getItem(clientConfig.storageKeys.apiOverride) &&
    !new URLSearchParams(window.location.search).get(clientConfig.apiOverrideQueryParam)
}

export function devCentralApiOrigin(): string {
  return devApiOrigin(clientConfig.devApiPort)
}

export function devHelperApiOrigin(): string {
  return devApiOrigin(clientConfig.devHelperApiPort)
}

export function storeApiOverride(value: string, source = manualOverrideSource): string {
  const origin = normaliseApiOrigin(value)
  localStorage.setItem(clientConfig.storageKeys.apiOverride, origin)
  localStorage.setItem(clientConfig.storageKeys.apiOverrideSource, source)
  return origin
}

export function storeAutomaticDevHelperOverride(): string {
  return storeApiOverride(devHelperApiOrigin(), automaticDevHelperSource)
}

export function isUsingAutomaticDevHelperFallback(): boolean {
  return localStorage.getItem(clientConfig.storageKeys.apiOverride) === devHelperApiOrigin() &&
    localStorage.getItem(clientConfig.storageKeys.apiOverrideSource) === automaticDevHelperSource
}

export function clearAutomaticDevHelperOverride(): void {
  if (!isUsingAutomaticDevHelperFallback()) return

  localStorage.removeItem(clientConfig.storageKeys.apiOverride)
  localStorage.removeItem(clientConfig.storageKeys.apiOverrideSource)
}

export async function isDevCentralApiAvailable(): Promise<boolean> {
  if (window.location.port !== clientConfig.devClientPort) return false

  try {
    const response = await fetch(new URL('/api/health', devCentralApiOrigin()).toString(), {
      cache: 'no-store'
    })
    return response.ok
  } catch {
    return false
  }
}

function devApiOrigin(port: string): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}`
}

function normaliseApiOrigin(value: string): string {
  const url = new URL(value, window.location.origin)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API override must use http or https')
  }
  return url.origin
}
