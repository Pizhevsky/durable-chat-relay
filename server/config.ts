import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { AppConfig, NodeRole } from '../shared/types.js'
import { defaultPortForRole, serverDefaults } from './defaults.js'

function readRole(): NodeRole {
  const role = process.env.NODE_ROLE ?? 'central'
  if (role !== 'central' && role !== 'helper') {
    throw new Error(`Unsupported NODE_ROLE: ${role}`)
  }
  return role
}

const nodeRole = readRole()

function readNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name]
  if (!rawValue) return fallback

  const value = Number(rawValue)
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`)
  }
  return value
}

export const serverConfig = {
  nodeRole,
  nodeId: process.env.NODE_ID ?? `${nodeRole}-${randomUUID().slice(0, serverDefaults.nodeIdSuffixLength)}`,
  port: readNumberEnv('PORT', defaultPortForRole(nodeRole)),
  databasePath: resolve(process.env.DATABASE_PATH ?? `./data/${nodeRole}.sqlite`),
  centralUrl: process.env.CENTRAL_URL,
  helperSyncMinIntervalMs: readNumberEnv('HELPER_SYNC_MIN_INTERVAL_MS', serverDefaults.helperSyncMinIntervalMs),
  helperSyncIntervalMs: readNumberEnv('HELPER_SYNC_INTERVAL_MS', serverDefaults.helperSyncIntervalMs),
  helperSyncMaxBackoffMs: readNumberEnv('HELPER_SYNC_MAX_BACKOFF_MS', serverDefaults.helperSyncMaxBackoffMs),
  helperSyncBatchSize: readNumberEnv('HELPER_SYNC_BATCH_SIZE', serverDefaults.helperSyncBatchSize),
  vapidSubject: process.env.VAPID_SUBJECT,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  helperSharedSecret: process.env.DCR_HELPER_SHARED_SECRET ?? 'local-dev-helper-secret',
  trustedHelperIds: (process.env.DCR_TRUSTED_HELPER_IDS ?? 'helper-demo')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  helperSignatureToleranceSeconds: readNumberEnv('DCR_HELPER_SIGNATURE_TOLERANCE_SECONDS', 300)
}

export function publicConfig(): AppConfig {
  return {
    nodeRole: serverConfig.nodeRole,
    nodeId: serverConfig.nodeId,
    centralUrl: serverConfig.centralUrl,
    vapidPublicKey: serverConfig.vapidPublicKey
  }
}
