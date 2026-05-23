import {
  RECOVERY_DUMP_FORMAT,
  type ChatEvent,
  type DeviceId,
  type RecoveryDump,
  type UserId
} from '../../../shared/types'
import { canonicalJson } from '../../../shared/recoveryChecksum'
import { nowIso } from '../utils/dates'
import { plainRecord } from '../utils/records'
import { localDb } from './localDbSchema'

export async function exportRecoveryDump(userId: UserId, deviceId: DeviceId): Promise<RecoveryDump> {
  const events = await localDb.events.orderBy('createdAt').toArray()
  return {
    format: RECOVERY_DUMP_FORMAT,
    exportedAt: nowIso(),
    exportedBy: userId,
    deviceId,
    events,
    checksum: await recoveryChecksum(events),
    note: 'Browser IndexedDB recovery dump. Import it into a helper or central node if automatic sync is not possible.'
  }
}

export async function importRecoveryDump(dump: RecoveryDump): Promise<void> {
  if (dump.format !== RECOVERY_DUMP_FORMAT) {
    throw new Error('Unsupported recovery dump format')
  }

  if (!Array.isArray(dump.events)) {
    throw new Error('Recovery dump must contain an events array')
  }

  if (!dump.checksum || dump.checksum !== await recoveryChecksum(dump.events)) {
    throw new Error('Recovery dump checksum does not match the events payload')
  }

  await localDb.events.bulkPut(dump.events.map((event) => ({
    ...plainRecord(event),
    localStatus: event.syncStatus === 'central-synced' ? 'sent-to-central' : 'pending',
    retryCount: 0,
    updatedAt: nowIso()
  })))
}

async function recoveryChecksum(events: ChatEvent[]): Promise<string> {
  const data = new TextEncoder().encode(canonicalJson(events))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
