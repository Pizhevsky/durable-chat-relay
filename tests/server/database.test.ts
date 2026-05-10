import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../../server/db/database'
import { ChatEventService } from '../../server/services/ChatEventService'
import type { ChatEvent } from '../../shared/types'

let tempDirs: string[] = []

function tempDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'resilient-field-chat-'))
  tempDirs.push(dir)
  return join(dir, 'central.sqlite')
}

function event(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    eventId: `device-a:${crypto.randomUUID()}`,
    originNodeId: 'central-demo',
    originDeviceId: 'device-a',
    actorUserId: 'u-denis',
    chatId: 'chat-persistent',
    type: 'chat.created',
    payload: {
      chatId: 'chat-persistent',
      clientChatId: 'chat-persistent',
      type: 'direct',
      memberIds: ['u-denis', 'u-anna']
    },
    createdAt: new Date().toISOString(),
    logicalClock: 1,
    syncStatus: 'local',
    ...overrides
  }
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('createDatabase', () => {
  it('keeps chats and messages after the server database is reopened', () => {
    const databasePath = tempDatabasePath()
    const firstDb = createDatabase(databasePath)
    const firstService = new ChatEventService(firstDb, 'central')

    firstService.applyEvent(event())
    firstService.applyEvent(event({
      eventId: 'device-a:message-1',
      type: 'message.created',
      payload: {
        messageId: 'msg-persistent',
        clientMessageId: 'msg-persistent',
        chatId: 'chat-persistent',
        text: 'This message must survive a restart.'
      },
      logicalClock: 2
    }))
    firstDb.pragma('wal_checkpoint(TRUNCATE)')
    firstDb.close()

    const reopenedDb = createDatabase(databasePath)
    const reopenedService = new ChatEventService(reopenedDb, 'central')

    expect(reopenedService.listChats('u-denis')).toHaveLength(1)
    expect(reopenedService.listMessages('chat-persistent', 'u-anna')).toHaveLength(1)
    expect(reopenedService.getEventsSince(0)).toHaveLength(2)
    reopenedDb.close()
  })
})
