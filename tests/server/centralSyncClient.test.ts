import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverConfig } from '../../server/config'
import { CentralSyncClient } from '../../server/sync/CentralSyncClient'
import type { SyncPullResponse, SyncResponse } from '../../shared/types'
import { chatCreatedEvent } from '../helpers/chatEvents'

const originalConfig = { ...serverConfig }

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body)
  } as Response
}

describe('CentralSyncClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.assign(serverConfig, originalConfig)
  })

  it('signs push and pull requests to the configured central server', async () => {
    serverConfig.nodeId = 'helper-test'
    serverConfig.helperSharedSecret = 'test-secret'
    const event = chatCreatedEvent({ eventId: 'helper:event-1' })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        accepted: [event.eventId],
        duplicates: [],
        conflicts: [],
        serverEvents: [],
        nodeRole: 'central',
        nodeId: 'central-demo'
      } satisfies SyncResponse))
      .mockResolvedValueOnce(jsonResponse({
        nodeRole: 'central',
        nodeId: 'central-demo',
        latestSequence: 10,
        events: []
      } satisfies SyncPullResponse))

    const client = new CentralSyncClient('http://central.test')
    await client.pushEvents('helper-test', [event])
    await client.pullEvents(7, 50)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://central.test/api/sync/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-DCR-Helper-Id': 'helper-test',
          'X-DCR-Signature': expect.any(String),
          'X-DCR-Timestamp': expect.any(String)
        })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://central.test/api/sync/events?since=7&limit=50',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-DCR-Helper-Id': 'helper-test',
          'X-DCR-Signature': expect.any(String),
          'X-DCR-Timestamp': expect.any(String)
        })
      })
    )
  })
})
