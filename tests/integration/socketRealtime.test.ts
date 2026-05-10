import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as createSocketClient } from 'socket.io-client'
import { localDb } from '../../client/src/storage/localDb'
import { registerSocketHandlers } from '../../server/socket/registerSocket'
import type { ChatEvent } from '../../shared/types'
import {
  chatCreated,
  closeServer,
  createService,
  listen,
  publish,
  restoreConfig,
  waitForSocketEvent
} from './helpers'

describe('Socket.IO realtime integration', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
    vi.restoreAllMocks()
    restoreConfig()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreConfig()
  })

  it('broadcasts chat events only to members and validates peer signaling targets', async () => {
    const { db, service } = createService()
    const httpServer = createServer()
    const ioServer = new Server(httpServer, { cors: { origin: '*' } })
    registerSocketHandlers(ioServer, service)
    const port = await listen(httpServer)
    const baseUrl = `http://127.0.0.1:${port}`
    const denis = createSocketClient(baseUrl, { transports: ['websocket'] })
    const anna = createSocketClient(baseUrl, { transports: ['websocket'] })
    const mark = createSocketClient(baseUrl, { transports: ['websocket'] })

    try {
      await Promise.all([
        waitForSocketEvent(denis, 'connect'),
        waitForSocketEvent(anna, 'connect'),
        waitForSocketEvent(mark, 'connect')
      ])

      denis.emit('client:hello', { userId: 'u-denis', deviceId: 'device-denis' })
      anna.emit('client:hello', { userId: 'u-anna', deviceId: 'device-anna' })
      mark.emit('client:hello', { userId: 'u-mark', deviceId: 'device-mark' })
      await Promise.all([
        waitForSocketEvent(denis, 'chat:list'),
        waitForSocketEvent(anna, 'chat:list'),
        waitForSocketEvent(mark, 'chat:list')
      ])

      const annaApplied = waitForSocketEvent<ChatEvent>(anna, 'event:applied')
      const markUnexpected = vi.fn()
      mark.on('event:applied', markUnexpected)
      const created = await publish(denis, chatCreated())

      expect((await annaApplied).chatId).toBe(created.chatId)
      expect(markUnexpected).not.toHaveBeenCalled()

      const signalToAnna = waitForSocketEvent(anna, 'peer:signal')
      denis.emit('peer:signal', {
        toUserId: 'u-anna',
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-offer' } }
      })
      await expect(signalToAnna).resolves.toMatchObject({ fromUserId: 'u-denis' })

      const markSignal = vi.fn()
      mark.on('peer:signal', markSignal)
      denis.emit('peer:signal', {
        toUserId: 'u-mark',
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-offer' } }
      })
      await new Promise((resolveValue) => setTimeout(resolveValue, 25))
      expect(markSignal).not.toHaveBeenCalled()
    } finally {
      denis.close()
      anna.close()
      mark.close()
      await ioServer.close()
      await closeServer(httpServer)
      db.close()
    }
  })
})
