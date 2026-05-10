import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import { localDb } from '../../client/src/storage/localDb'
import { serverConfig } from '../../server/config'
import { registerRoutes } from '../../server/routes'
import { startHelperSync } from '../../server/sync/helperSync'
import type { ChatEvent } from '../../shared/types'
import { chatCreated, closeServer, createService, listen, restoreConfig } from './helpers'

describe('helper-to-central HTTP sync integration', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
    vi.restoreAllMocks()
    restoreConfig()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    restoreConfig()
  })

  it('syncs helper events to central and pulls central events through real routes', async () => {
    const central = createService('central')
    const helper = createService('helper')
    const app = express()
    app.use(express.json())
    registerRoutes(app, central.service)
    const httpServer = createServer(app)
    const port = await listen(httpServer)
    const centralUrl = `http://127.0.0.1:${port}`
    const centralOnly = chatCreated({
      eventId: 'central:mark-ivan',
      originNodeId: 'central-demo',
      actorUserId: 'u-mark',
      chatId: 'chat-mark-ivan',
      payload: {
        chatId: 'chat-mark-ivan',
        clientChatId: 'chat-mark-ivan',
        type: 'direct',
        memberIds: ['u-mark', 'u-ivan']
      }
    })
    const helperOnly = chatCreated({
      eventId: 'helper:denis-anna',
      originNodeId: 'helper-demo',
      chatId: 'chat-denis-anna'
    })
    const emitted: ChatEvent[] = []

    central.service.applyEvent(centralOnly)
    helper.service.applyEvent(helperOnly)
    serverConfig.nodeRole = 'helper'
    serverConfig.nodeId = 'helper-demo'
    serverConfig.centralUrl = centralUrl
    serverConfig.helperSyncIntervalMs = 1000
    serverConfig.helperSyncMaxBackoffMs = 2000

    const stop = startHelperSync(helper.service, (event) => emitted.push(event))

    try {
      await vi.waitFor(() => {
        expect(central.service.listChats('u-anna').map((chat) => chat.id)).toContain('chat-denis-anna')
        expect(helper.service.listChats('u-ivan').map((chat) => chat.id)).toContain('chat-mark-ivan')
      })

      expect(helper.service.getPendingCentralSync()).toHaveLength(0)
      expect(helper.service.getSyncCursor(`central:${centralUrl}:sequence`)).toBe(2)
      expect(emitted.map((event) => event.eventId)).toEqual(
        expect.arrayContaining(['central:mark-ivan', 'helper:denis-anna'])
      )
    } finally {
      stop()
      await closeServer(httpServer)
      central.db.close()
      helper.db.close()
    }
  })
})
