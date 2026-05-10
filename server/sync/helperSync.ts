import type { ChatEvent, SyncPullResponse, SyncResponse } from '../../shared/types.js'
import { serverConfig } from '../config.js'
import type { ChatEventService } from '../services/ChatEventService.js'

export function startHelperSync(service: ChatEventService, emitAppliedEvent: (event: ChatEvent) => void): () => void {
  if (serverConfig.nodeRole !== 'helper' || !serverConfig.centralUrl) return () => undefined

  const baseDelay = Math.max(1000, serverConfig.helperSyncIntervalMs)
  const maxDelay = Math.max(baseDelay, serverConfig.helperSyncMaxBackoffMs)
  let nextDelay = baseDelay
  let timer: NodeJS.Timeout | null = null
  let isRunning = false
  let stopped = false

  async function pushPendingEvents(): Promise<void> {
    const events = service.getPendingCentralSync(200)
    if (events.length === 0) return

    const response = await fetch(`${serverConfig.centralUrl}/api/sync/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceNodeId: serverConfig.nodeId,
        events
      })
    })

    if (!response.ok) throw new Error(`Central push failed: ${response.status}`)
    const result = await response.json() as SyncResponse
    service.markCentralSynced([...result.accepted, ...result.duplicates])

    for (const event of result.serverEvents) {
      emitAppliedEvent(event)
    }
  }

  async function pullCentralEvents(): Promise<void> {
    const cursorKey = `central:${serverConfig.centralUrl}:sequence`
    const since = service.getSyncCursor(cursorKey)
    const response = await fetch(
      `${serverConfig.centralUrl}/api/sync/events?since=${encodeURIComponent(String(since))}`
    )

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
      nextDelay = Math.min(nextDelay * 2, maxDelay)
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
