import { RECOVERY_DUMP_FORMAT, type RecoveryDump } from '../../../shared/types'

export function downloadRecoveryDump(dump: RecoveryDump): void {
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `chat-recovery-${dump.exportedBy}-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export async function readRecoveryDump(file: File): Promise<RecoveryDump> {
  const text = await file.text()
  const dump = JSON.parse(text) as RecoveryDump

  if (dump.format !== RECOVERY_DUMP_FORMAT) {
    throw new Error('Unsupported recovery dump format')
  }

  if (!Array.isArray(dump.events)) {
    throw new Error('Recovery dump does not contain an events array')
  }

  return dump
}
