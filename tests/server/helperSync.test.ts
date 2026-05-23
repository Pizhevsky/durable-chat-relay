import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverConfig } from '../../server/config'
import type { ChatEventService } from '../../server/services/ChatEventService'
import { startHelperSync } from '../../server/sync/helperSync'
import type { ChatEvent, SyncPullResponse, SyncResponse } from '../../shared/types'
import { chatCreatedEvent } from '../helpers/chatEvents'

const originalConfig = { ...serverConfig }

function event(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    ...chatCreatedEvent({
      eventId: `device-a:${crypto.randomUUID()}`,
      originNodeId: 'helper-demo',
      originDeviceId: 'device-a',
      actorUserId: 'u-denis',
      chatId: 'chat-sync',
      payload: {
        chatId: 'chat-sync',
        clientChatId: 'chat-sync',
        type: 'direct',
        memberIds: ['u-denis', 'u-anna']
      },
      syncStatus: 'helper-synced'
    }),
    ...overrides
  }
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body)
  } as Response
}

function configureHelperSync(): void {
  serverConfig.nodeRole = 'helper'
  serverConfig.nodeId = 'helper-test'
  serverConfig.centralUrl = 'http://central.test'
  serverConfig.helperSyncIntervalMs = 1000
  serverConfig.helperSyncMaxBackoffMs = 4000
}

function restoreConfig(): void {
  Object.assign(serverConfig, originalConfig)
}

function serviceForHelperSync(service: object): ChatEventService {
  return service as ChatEventService
}

describe('helper sync', () => {
  beforeEach(() => {
    configureHelperSync()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    restoreConfig()
  })

  it('pushes pending helper events, pulls central events and advances the pull cursor', async () => {
    const pendingEvent = event({ eventId: 'helper:event-1' })
    const centralEvent = event({
      eventId: 'central:event-2',
      originNodeId: 'central-demo',
      syncStatus: 'central-synced'
    })
    const service = {
      getPendingCentralSync: vi.fn(() => [pendingEvent]),
      markCentralSynced: vi.fn(),
      markCentralConflicted: vi.fn(),
      getSyncCursor: vi.fn(() => 7),
      applyEvents: vi.fn((events: ChatEvent[]) => ({
        accepted: events.map((event) => event.eventId),
        duplicates: [],
        conflicts: [],
        serverEvents: events
      })),
      setSyncCursor: vi.fn()
    }
    const emitAppliedEvent = vi.fn()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        accepted: [pendingEvent.eventId],
        duplicates: [],
        conflicts: [],
        serverEvents: [pendingEvent],
        nodeRole: 'central',
        nodeId: 'central-demo'
      } satisfies SyncResponse))
      .mockResolvedValueOnce(jsonResponse({
        nodeRole: 'central',
        nodeId: 'central-demo',
        latestSequence: 12,
        events: [centralEvent]
      } satisfies SyncPullResponse))

    const stop = startHelperSync(serviceForHelperSync(service), emitAppliedEvent)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    stop()

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
      `http://central.test/api/sync/events?since=7&limit=${serverConfig.helperSyncBatchSize}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-DCR-Helper-Id': 'helper-test',
          'X-DCR-Signature': expect.any(String),
          'X-DCR-Timestamp': expect.any(String)
        })
      })
    )
    expect(service.markCentralSynced).toHaveBeenCalledWith([pendingEvent.eventId])
    expect(service.markCentralConflicted).toHaveBeenCalledWith([])
    expect(service.applyEvents).toHaveBeenCalledWith([pendingEvent])
    expect(service.applyEvents).toHaveBeenCalledWith([centralEvent])
    expect(service.setSyncCursor).toHaveBeenCalledWith('central:http://central.test:sequence', 12)
    expect(emitAppliedEvent).toHaveBeenCalledWith(pendingEvent)
    expect(emitAppliedEvent).toHaveBeenCalledWith(centralEvent)
  })

  it('marks central conflicts so rejected helper events are visible', async () => {
    const pendingEvent = event({ eventId: 'helper:event-conflict' })
    const service = {
      getPendingCentralSync: vi.fn(() => [pendingEvent]),
      markCentralSynced: vi.fn(),
      markCentralConflicted: vi.fn(),
      getSyncCursor: vi.fn(() => 0),
      applyEvents: vi.fn(),
      setSyncCursor: vi.fn()
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        accepted: [],
        duplicates: [],
        conflicts: [{
          eventId: pendingEvent.eventId,
          code: 'USER_NOT_FOUND',
          message: 'Unknown user: u-denis'
        }],
        serverEvents: [],
        nodeRole: 'central',
        nodeId: 'central-demo'
      } satisfies SyncResponse))
      .mockResolvedValueOnce(jsonResponse({
        nodeRole: 'central',
        nodeId: 'central-demo',
        latestSequence: 0,
        events: []
      } satisfies SyncPullResponse))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const stop = startHelperSync(serviceForHelperSync(service), vi.fn())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    stop()

    expect(service.markCentralSynced).toHaveBeenCalledWith([])
    expect(service.markCentralConflicted).toHaveBeenCalledWith([pendingEvent.eventId])
  })

  it('keeps retryable central conflicts pending for a later sync pass', async () => {
    const pendingEvent = event({ eventId: 'helper:event-retryable-conflict' })
    const service = {
      getPendingCentralSync: vi.fn(() => [pendingEvent]),
      markCentralSynced: vi.fn(),
      markCentralConflicted: vi.fn(),
      getSyncCursor: vi.fn(() => 0),
      applyEvents: vi.fn(),
      setSyncCursor: vi.fn()
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        accepted: [],
        duplicates: [],
        conflicts: [{
          eventId: pendingEvent.eventId,
          code: 'CAUSAL_DEPENDENCY_MISSING',
          message: 'Event depends on a chat that has not been accepted by central yet.',
          retryable: true
        }],
        serverEvents: [],
        nodeRole: 'central',
        nodeId: 'central-demo'
      } satisfies SyncResponse))
      .mockResolvedValueOnce(jsonResponse({
        nodeRole: 'central',
        nodeId: 'central-demo',
        latestSequence: 0,
        events: []
      } satisfies SyncPullResponse))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const stop = startHelperSync(serviceForHelperSync(service), vi.fn())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    stop()

    expect(service.markCentralSynced).toHaveBeenCalledWith([])
    expect(service.markCentralConflicted).toHaveBeenCalledWith([])
  })

  it('probes quickly after a central sync failure so Laravel startup is detected promptly', async () => {
    vi.useFakeTimers()
    const service = {
      getPendingCentralSync: vi.fn(() => []),
      getSyncCursor: vi.fn(() => 0)
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValue(jsonResponse({
        nodeRole: 'central',
        nodeId: 'central-demo',
        latestSequence: 0,
        events: []
      } satisfies SyncPullResponse))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const stop = startHelperSync(serviceForHelperSync(service), vi.fn())
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(serverConfig.helperSyncMinIntervalMs - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    stop()
  })
})
