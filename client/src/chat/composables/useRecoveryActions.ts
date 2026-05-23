import type { DeviceId } from '../../../../shared/types'
import { api } from '../../services/api'
import { downloadRecoveryDump, readRecoveryDump } from '../../services/recoveryFiles'
import { exportRecoveryDump, importRecoveryDump } from '../../storage/localDb'
import type { ChatState } from './useChatState'

interface RecoveryActionsInput {
  state: ChatState
  deviceId: DeviceId
  refreshChats: () => Promise<void>
  retryPending: () => Promise<void>
}

export function useRecoveryActions(input: RecoveryActionsInput) {
  async function exportDump(): Promise<void> {
    const dump = await exportRecoveryDump(input.state.currentUserId.value, input.deviceId)
    downloadRecoveryDump(dump)
  }

  async function importDump(file: File): Promise<void> {
    const dump = await readRecoveryDump(file)
    await importRecoveryDump(dump)
    await api.importRecovery(dump)
    await input.retryPending()
    await input.refreshChats()
  }

  return {
    exportDump,
    importDump
  }
}
