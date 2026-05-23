import type { Express } from 'express'
import { createHash } from 'node:crypto'
import { RECOVERY_DUMP_FORMAT, type ChatEvent, type RecoveryDump } from '../../shared/types.js'
import { canonicalJson } from '../../shared/recoveryChecksum.js'
import { serverConfig } from '../config.js'
import type { ChatEventService } from '../services/ChatEventService.js'

export function registerRecoveryRoutes(app: Express, service: ChatEventService): void {
  app.get('/api/recovery/export', (request, response) => {
    const userId = String(request.query.userId ?? 'unknown')
    const deviceId = String(request.query.deviceId ?? 'server-export')
    const events = service.exportEvents()
    const dump: RecoveryDump = {
      format: RECOVERY_DUMP_FORMAT,
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      deviceId,
      events,
      checksum: recoveryChecksum(events),
      note: 'Server-side recovery export. Browser IndexedDB exports are available from the client UI.'
    }
    response.setHeader('Content-Disposition', `attachment; filename="chat-recovery-${serverConfig.nodeId}.json"`)
    response.json(dump)
  })

  app.post('/api/recovery/import', (request, response) => {
    const dump = request.body as RecoveryDump
    if (dump.format !== RECOVERY_DUMP_FORMAT) {
      response.status(422).json({ error: 'Unsupported recovery dump format' })
      return
    }

    if (!Array.isArray(dump.events)) {
      response.status(422).json({ error: 'Recovery dump must contain an events array', code: 'INVALID_RECOVERY_DUMP' })
      return
    }

    if (!dump.checksum || dump.checksum !== recoveryChecksum(dump.events)) {
      response.status(422).json({ error: 'Recovery dump checksum does not match the events payload', code: 'RECOVERY_CHECKSUM_MISMATCH' })
      return
    }

    const result = service.applyEvents(dump.events)
    response.json(result)
  })
}

function recoveryChecksum(events: ChatEvent[]): string {
  return createHash('sha256').update(canonicalJson(events)).digest('hex')
}
