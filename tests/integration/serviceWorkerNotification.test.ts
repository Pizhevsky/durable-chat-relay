import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

describe('service-worker notification integration', () => {
  it('focuses an existing client and opens the clicked notification chat', async () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'client/worker.js'), 'utf8')
    const handlers = new Map<string, (event: WorkerEvent) => void>()
    const focusedClient = {
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
      }
    }
    vm.runInNewContext(workerSource, context)
    const clickHandler = handlers.get('notificationclick')
    if (!clickHandler) throw new Error('notificationclick handler was not registered')
    const waitUntilPromises: Promise<unknown>[] = []

    clickHandler({
      notification: {
        data: { chatId: 'chat-denis-anna' },
        close: vi.fn()
      },
      waitUntil: (promise) => waitUntilPromises.push(promise)
    })
    await Promise.all(waitUntilPromises)

    expect(focusedClient.focus).toHaveBeenCalled()
    expect(focusedClient.postMessage).toHaveBeenCalledWith({
      type: 'OPEN_CHAT',
      chatId: 'chat-denis-anna'
    })
    expect(openWindow).not.toHaveBeenCalled()
  })
})

interface WorkerEvent {
  notification: {
    data?: { chatId?: string }
    close: () => void
  }
  waitUntil: (promise: Promise<unknown>) => void
}
