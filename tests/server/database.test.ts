import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../../server/db/database'
import { ChatEventService } from '../../server/services/ChatEventService'
import { chatCreatedEvent, messageCreatedEvent } from '../helpers/chatEvents'

let tempDirs: string[] = []

function tempDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'durable-chat-'))
  tempDirs.push(dir)
  return join(dir, 'central.sqlite')
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

    firstService.applyEvent(chatCreatedEvent({
      chatId: 'chat-persistent',
      originNodeId: 'central-demo',
      originDeviceId: 'device-a',
      payload: { chatId: 'chat-persistent', clientChatId: 'chat-persistent' }
    }))
    firstService.applyEvent(messageCreatedEvent({
      eventId: 'device-a:message-1',
      originNodeId: 'central-demo',
      originDeviceId: 'device-a',
      chatId: 'chat-persistent',
      payload: {
        messageId: 'msg-persistent',
        clientMessageId: 'msg-persistent',
        chatId: 'chat-persistent',
        text: 'This message must survive a restart.'
      }
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
