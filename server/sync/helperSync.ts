import type { ChatEvent, EventId, SyncPullResponse, SyncResponse } from '../../shared/types.js'
import { serverConfig } from '../config.js'
import { signCentralRequest } from '../security/helperAuth.js'
import type { ChatEventService } from '../services/ChatEventService.js'

export function startHelperSync(service: ChatEventService, emitAppliedEvent: (event: ChatEvent) => void): () => void {
  if (serverConfig.nodeRole !== 'helper' || !serverConfig.centralUrl) return () => undefined

  const baseDelay = Math.max(serverConfig.helperSyncMinIntervalMs, serverConfig.helperSyncIntervalMs)
  const retryProbeDelay = Math.min(serverConfig.helperSyncMinIntervalMs, baseDelay)
  let nextDelay = baseDelay
  let timer: NodeJS.Timeout | null = null
  let isRunning = false
  let stopped = false

  async function pushPendingEvents(): Promise<void> {
    const events = service.getPendingCentralSync(serverConfig.helperSyncBatchSize)
    if (events.length === 0) return

    const url = new URL(`${serverConfig.centralUrl}/api/sync/events`)
    const body = JSON.stringify({
      sourceNodeId: serverConfig.nodeId,
      events
    })
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signCentralRequest('POST', url, body)
      },
      body
    })

    if (!response.ok) throw new Error(`Central push failed: ${response.status}`)
    const result = await response.json() as SyncResponse
    service.markCentralSynced([...result.accepted, ...result.duplicates])
    const conflictedEventIds = permanentSyncConflictEventIds(result.conflicts)
    service.markCentralConflicted(conflictedEventIds)
    logSyncConflicts(result.conflicts)

    if (result.serverEvents.length > 0) {
      const applied = service.applyEvents(result.serverEvents)
      for (const event of applied.serverEvents) emitAppliedEvent(event)
    }
  }

  async function pullCentralEvents(): Promise<void> {
    const cursorKey = `central:${serverConfig.centralUrl}:sequence`
    const since = service.getSyncCursor(cursorKey)
    const url = new URL(`${serverConfig.centralUrl}/api/sync/events`)
    url.searchParams.set('since', String(since))
    url.searchParams.set('limit', String(serverConfig.helperSyncBatchSize))
    const response = await fetch(url.toString(), {
      headers: signCentralRequest('GET', url)
    })

    if (!response.ok) throw new Error(`Central pull failed: ${response.status}`)
    const result = await response.json() as SyncPullResponse

    if (result.events.length > 0) {
      const applied = service.applyEvents(result.events)
      for (const event of applied.serverEvents) emitAppliedEvent(event)
    }

    service.setSyncCursor(cursorKey, result.latestSequence)
  }

  const syncOnce = async () => {
    if (stopped) return
    if (isRunning) return
    isRunning = true
    try {
      await pushPendingEvents()
      await pullCentralEvents()
      nextDelay = baseDelay
    } catch (error) {
      console.warn('[helper-sync] central unavailable:', error instanceof Error ? error.message : error)
      nextDelay = retryProbeDelay
    } finally {
      isRunning = false
    }
  }

  const schedule = () => {
    if (stopped) return
    timer = setTimeout(async () => {
      await syncOnce()
      schedule()
    }, nextDelay)
  }

  syncOnce().finally(schedule)

  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    process.off('SIGTERM', stop)
  }

  process.once('SIGTERM', stop)
  return stop
}

function permanentSyncConflictEventIds(conflicts: SyncResponse['conflicts']): EventId[] {
  return conflicts
    .filter((conflict) => typeof conflict === 'string' || !conflict.retryable)
    .map((conflict) => typeof conflict === 'string' ? conflict : conflict.eventId)
    .filter((eventId): eventId is EventId => Boolean(eventId))
}

function logSyncConflicts(conflicts: SyncResponse['conflicts']): void {
  for (const conflict of conflicts) {
    if (typeof conflict === 'string') {
      console.warn(`[helper-sync] central rejected event: ${conflict}`)
      continue
    }

    console.warn(
      `[helper-sync] central rejected event: ${conflict.eventId}` +
      (conflict.code ? ` (${conflict.code})` : '') +
      (conflict.retryable ? ' retryable' : '') +
      (conflict.message ? ` ${conflict.message}` : '')
    )
  }
}
