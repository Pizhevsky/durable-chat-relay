import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

describe('service-worker notification integration', () => {
  it('focuses an existing client and opens the clicked notification chat', async () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'client/worker.js'), 'utf8')
    const handlers = new Map<string, (event: WorkerEvent) => void>()
    const focusedClient = {
      id: 'client-anna',
      url: 'http://localhost:1234/?user=u-anna',
      focus: vi.fn(),
      postMessage: vi.fn()
    }
    const openWindow = vi.fn()
    const context = {
      self: {
        registration: { showNotification: vi.fn() },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
        addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
          handlers.set(type, handler)
        }
      },
      clients: {
        matchAll: vi.fn(() => Promise.resolve([focusedClient])),
        openWindow
      },
      URL,
      URLSearchParams
    }
    vm.runInNewContext(workerSource, context)
    const clickHandler = handlers.get('notificationclick')
    if (!clickHandler) throw new Error('notificationclick handler was not registered')
    const waitUntilPromises: Promise<unknown>[] = []

    clickHandler({
      notification: {
        data: { chatId: 'chat-denis-anna', userId: 'u-anna' },
        close: vi.fn()
      },
      waitUntil: (promise) => waitUntilPromises.push(promise)
    })
    await Promise.all(waitUntilPromises)

    expect(focusedClient.focus).toHaveBeenCalled()
    expect(focusedClient.postMessage).toHaveBeenCalledWith({
      type: 'OPEN_CHAT',
      chatId: 'chat-denis-anna',
      userId: 'u-anna'
    })
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a user-specific app URL when no matching client exists', async () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'client/worker.js'), 'utf8')
    const handlers = new Map<string, (event: WorkerEvent) => void>()
    const wrongUserClient = {
      id: 'client-denis',
      url: 'http://localhost:1234/?user=u-denis',
      focus: vi.fn(),
      postMessage: vi.fn()
    }
    const openWindow = vi.fn()
    const context = {
      self: {
        registration: { showNotification: vi.fn() },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
        addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
          handlers.set(type, handler)
        }
      },
      clients: {
        matchAll: vi.fn(() => Promise.resolve([wrongUserClient])),
        openWindow
      },
      URL,
      URLSearchParams
    }

    vm.runInNewContext(workerSource, context)
    const clickHandler = handlers.get('notificationclick')
    if (!clickHandler) throw new Error('notificationclick handler was not registered')
    const waitUntilPromises: Promise<unknown>[] = []

    clickHandler({
      notification: {
        data: { chatId: 'chat-denis-anna', userId: 'u-anna' },
        close: vi.fn()
      },
      waitUntil: (promise) => waitUntilPromises.push(promise)
    })
    await Promise.all(waitUntilPromises)

    expect(wrongUserClient.focus).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/?chat=chat-denis-anna&user=u-anna')
  })


  it('uses announced client state so a user-switched window is focused instead of opening a duplicate window', async () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'client/worker.js'), 'utf8')
    const handlers = new Map<string, (event: WorkerEvent) => void>()
    const switchedClient = {
      id: 'client-kate-window',
      url: 'http://localhost:1234/?user=u-kate',
      focus: vi.fn(),
      postMessage: vi.fn()
    }
    const openWindow = vi.fn()
    const context = {
      self: {
        registration: { showNotification: vi.fn() },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
        addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
          handlers.set(type, handler)
        }
      },
      clients: {
        matchAll: vi.fn(() => Promise.resolve([switchedClient])),
        openWindow
      },
      URL,
      URLSearchParams,
      Date
    }

    vm.runInNewContext(workerSource, context)
    const messageHandler = handlers.get('message')
    const clickHandler = handlers.get('notificationclick')
    if (!messageHandler || !clickHandler) throw new Error('worker handlers were not registered')

    messageHandler({
      data: { type: 'CLIENT_STATE', userId: 'u-ivan', url: 'http://localhost:1234/?user=u-ivan' },
      source: { id: 'client-kate-window' }
    })

    const waitUntilPromises: Promise<unknown>[] = []
    clickHandler({
      notification: {
        data: { chatId: 'chat-denis-ivan', userId: 'u-ivan' },
        close: vi.fn()
      },
      waitUntil: (promise) => waitUntilPromises.push(promise)
    })
    await Promise.all(waitUntilPromises)

    expect(switchedClient.focus).toHaveBeenCalled()
    expect(switchedClient.postMessage).toHaveBeenCalledWith({
      type: 'OPEN_CHAT',
      chatId: 'chat-denis-ivan',
      userId: 'u-ivan'
    })
    expect(openWindow).not.toHaveBeenCalled()
  })


  it('ignores stale announced client state before matching a notification click', async () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'client/worker.js'), 'utf8')
    const handlers = new Map<string, (event: WorkerEvent) => void>()
    let now = 0
    const staleClient = {
      id: 'client-old-ivan-state',
      url: 'http://localhost:1234/?user=u-kate',
      focus: vi.fn(),
      postMessage: vi.fn()
    }
    const openWindow = vi.fn()
    const context = {
      self: {
        registration: { showNotification: vi.fn() },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
        addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
          handlers.set(type, handler)
        }
      },
      clients: {
        matchAll: vi.fn(() => Promise.resolve([staleClient])),
        openWindow
      },
      URL,
      URLSearchParams,
      Date: { now: () => now }
    }

    vm.runInNewContext(workerSource, context)
    const messageHandler = handlers.get('message')
    const clickHandler = handlers.get('notificationclick')
    if (!messageHandler || !clickHandler) throw new Error('worker handlers were not registered')

    messageHandler({
      data: { type: 'CLIENT_STATE', userId: 'u-ivan', url: 'http://localhost:1234/?user=u-ivan' },
      source: { id: 'client-old-ivan-state' }
    })
    now = 6 * 60 * 1000

    const waitUntilPromises: Promise<unknown>[] = []
    clickHandler({
      notification: {
        data: { chatId: 'chat-denis-ivan', userId: 'u-ivan' },
        close: vi.fn()
      },
      waitUntil: (promise) => waitUntilPromises.push(promise)
    })
    await Promise.all(waitUntilPromises)

    expect(staleClient.focus).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/?chat=chat-denis-ivan&user=u-ivan')
  })

})

interface WorkerEvent {
  data?: unknown
  source?: { id?: string }
  notification?: {
    data?: { chatId?: string; userId?: string }
    close: () => void
  }
  waitUntil?: (promise: Promise<unknown>) => void
}
