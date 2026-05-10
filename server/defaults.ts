import type { NodeRole } from '../shared/types.js'

export const serverDefaults = {
  centralPort: 3000,
  helperPort: 3001,
  helperSyncIntervalMs: 7000,
  helperSyncMaxBackoffMs: 60000
}

export function defaultPortForRole(role: NodeRole): number {
  return role === 'helper' ? serverDefaults.helperPort : serverDefaults.centralPort
}
