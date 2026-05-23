import type { ChatEvent } from './events.js'
import type { DeviceId, UserId } from './ids.js'

export const RECOVERY_DUMP_FORMAT = 'durable-chat-recovery-v1' as const

export interface RecoveryDump {
  format: typeof RECOVERY_DUMP_FORMAT
  exportedAt: string
  exportedBy: UserId
  deviceId: DeviceId
  events: ChatEvent[]
  checksum: string
  note?: string
}
