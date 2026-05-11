import type { NodeRole } from '../shared/types.js'

export const serverDefaults = {
  centralPort: 3000,
  helperPort: 3001,
  nodeIdSuffixLength: 8,
  helperSyncMinIntervalMs: 1000,
  helperSyncIntervalMs: 7000,
  helperSyncMaxBackoffMs: 60000,
  helperSyncBatchSize: 200
}

export function defaultPortForRole(role: NodeRole): number {
  return role === 'helper' ? serverDefaults.helperPort : serverDefaults.centralPort
}
