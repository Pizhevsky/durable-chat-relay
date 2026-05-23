import type { NodeId, NodeRole } from './ids.js'

export interface AppConfig {
  nodeRole: NodeRole
  nodeId: NodeId
  centralUrl?: string
  vapidPublicKey?: string
}
