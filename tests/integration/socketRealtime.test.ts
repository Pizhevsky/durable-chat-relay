import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client'
import { localDb } from '../../client/src/storage/localDb'
import { registerSocketHandlers } from '../../server/socket/registerSocket'
import type { ChatEvent, PeerDirectorySnapshot } from '../../shared/types'
import {
  chatCreated,
  closeServer,
  createService,
  listen,
  publish,
  restoreConfig,
  waitForSocketEvent
} from '../helpers/integration'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function expectNoSocketEvent(socket: ClientSocket, eventName: string): Promise<void> {
  const handler = vi.fn()
  socket.on(eventName, handler)
  await delay(60)
  socket.off(eventName, handler)
  expect(handler).not.toHaveBeenCalled()
}

function waitForSocketEventMatching<T>(
  socket: ClientSocket,
  eventName: string,
  predicate: (payload: T) => boolean
): Promise<T> {
  return new Promise((resolveValue) => {
    const handler = (payload: T) => {
      if (!predicate(payload)) return
      socket.off(eventName, handler)
      resolveValue(payload)
    }

    socket.on(eventName, handler)
  })
}

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

  it('broadcasts chat events only to members and exposes a peer directory for shared-chat users', async () => {
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

      const initialChatLists = Promise.all([
        waitForSocketEvent(denis, 'chat:list'),
        waitForSocketEvent(anna, 'chat:list'),
        waitForSocketEvent(mark, 'chat:list')
      ])
      denis.emit('client:hello', { userId: 'u-denis', deviceId: 'device-denis' })
      anna.emit('client:hello', { userId: 'u-anna', deviceId: 'device-anna' })
      mark.emit('client:hello', { userId: 'u-mark', deviceId: 'device-mark' })
      await initialChatLists

      const annaApplied = waitForSocketEvent<ChatEvent>(anna, 'event:applied')
      const markUnexpected = vi.fn()
      mark.on('event:applied', markUnexpected)
      const created = await publish(denis, chatCreated())

      expect((await annaApplied).chatId).toBe(created.chatId)
      expect(markUnexpected).not.toHaveBeenCalled()

      const annaDirectory = waitForSocketEvent<PeerDirectorySnapshot>(anna, 'peer:directory')
      denis.emit('client:mode', { localOnly: true })
      const directory = await annaDirectory
      expect(directory.peers).toContainEqual(expect.objectContaining({
        userId: 'u-denis',
        isOnline: true,
        isLocalOnly: true
      }))

      const signalToAnna = waitForSocketEvent(anna, 'peer:signal')
      denis.emit('peer:signal', {
        toUserId: 'u-anna',
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-offer' } }
      })
      await expect(signalToAnna).resolves.toMatchObject({ fromUserId: 'u-denis' })

      denis.emit('peer:signal', {
        toUserId: 'u-mark',
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-offer' } }
      })
      await expectNoSocketEvent(mark, 'peer:signal')
    } finally {
      denis.close()
      anna.close()
      mark.close()
      await ioServer.close()
      await closeServer(httpServer)
      db.close()
    }
  })

  it('rebuilds peer directory and signaling when a demo window changes selected user', async () => {
    const { db, service } = createService()
    service.applyEvent(chatCreated({
      chatId: 'chat-denis-anna',
      actorUserId: 'u-denis',
      payload: {
        chatId: 'chat-denis-anna',
        clientChatId: 'chat-denis-anna',
        type: 'direct',
        memberIds: ['u-denis', 'u-anna']
      }
    }))
    service.applyEvent(chatCreated({
      chatId: 'chat-anna-kate',
      actorUserId: 'u-anna',
      payload: {
        chatId: 'chat-anna-kate',
        clientChatId: 'chat-anna-kate',
        type: 'direct',
        memberIds: ['u-anna', 'u-kate']
      }
    }))
    service.applyEvent(chatCreated({
      chatId: 'chat-field-team',
      actorUserId: 'u-anna',
      payload: {
        chatId: 'chat-field-team',
        clientChatId: 'chat-field-team',
        type: 'group',
        title: 'Field team',
        memberIds: ['u-anna', 'u-denis', 'u-ivan']
      }
    }))

    const httpServer = createServer()
    const ioServer = new Server(httpServer, { cors: { origin: '*' } })
    registerSocketHandlers(ioServer, service)
    const port = await listen(httpServer)
    const baseUrl = `http://127.0.0.1:${port}`
    const denis = createSocketClient(baseUrl, { transports: ['websocket'] })
    const anna = createSocketClient(baseUrl, { transports: ['websocket'] })
    const kateWindow = createSocketClient(baseUrl, { transports: ['websocket'] })

    try {
      await Promise.all([
        waitForSocketEvent(denis, 'connect'),
        waitForSocketEvent(anna, 'connect'),
        waitForSocketEvent(kateWindow, 'connect')
      ])

      const initialChatLists = Promise.all([
        waitForSocketEvent(denis, 'chat:list'),
        waitForSocketEvent(anna, 'chat:list'),
        waitForSocketEvent(kateWindow, 'chat:list')
      ])
      denis.emit('client:hello', { userId: 'u-denis', deviceId: 'device-denis' })
      anna.emit('client:hello', { userId: 'u-anna', deviceId: 'device-anna' })
      kateWindow.emit('client:hello', { userId: 'u-kate', deviceId: 'device-kate-window' })
      await initialChatLists

      const annaDirectoryAfterLocalOnly = waitForSocketEventMatching<PeerDirectorySnapshot>(
        anna,
        'peer:directory',
        (directory) => directory.peers.some((peer) => peer.userId === 'u-denis' && peer.isLocalOnly)
      )
      denis.emit('client:mode', { localOnly: true })
      anna.emit('client:mode', { localOnly: true })
      await annaDirectoryAfterLocalOnly

      const annaDirectoryAfterIvan = waitForSocketEventMatching<PeerDirectorySnapshot>(
        anna,
        'peer:directory',
        (directory) =>
          directory.peers.some((peer) => peer.userId === 'u-ivan') &&
          !directory.peers.some((peer) => peer.userId === 'u-kate')
      )
      const ivanChatList = waitForSocketEvent<Array<{ id: string }>>(kateWindow, 'chat:list')
      kateWindow.emit('client:hello', { userId: 'u-ivan', deviceId: 'device-kate-window' })
      const ivanChats = await ivanChatList
      expect(ivanChats.map((chat) => chat.id)).toContain('chat-field-team')
      expect(ivanChats.map((chat) => chat.id)).not.toContain('chat-anna-kate')

      const directory = await annaDirectoryAfterIvan
      expect(directory.peers).toContainEqual(expect.objectContaining({ userId: 'u-denis', isLocalOnly: true }))
      expect(directory.peers).toContainEqual(expect.objectContaining({ userId: 'u-ivan' }))
      expect(directory.peers.some((peer) => peer.userId === 'u-kate')).toBe(false)

      const signalToIvan = waitForSocketEvent(kateWindow, 'peer:signal')
      anna.emit('peer:signal', {
        toUserId: 'u-ivan',
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-offer-for-ivan' } }
      })
      await expect(signalToIvan).resolves.toMatchObject({ fromUserId: 'u-anna' })

      anna.emit('peer:signal', {
        toUserId: 'u-kate',
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'stale-kate-offer' } }
      })
      await expectNoSocketEvent(kateWindow, 'peer:signal')
    } finally {
      denis.close()
      anna.close()
      kateWindow.close()
      await ioServer.close()
      await closeServer(httpServer)
      db.close()
    }
  })

})
