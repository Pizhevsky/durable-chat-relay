import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { initialiseSchema, seedDemoUsers } from './schema.js'

export function createDatabase(databasePath: string): Database.Database {
  mkdirSync(dirname(databasePath), { recursive: true })
  const db = new Database(databasePath)
  initialiseSchema(db)
  seedDemoUsers(db)
  db.pragma('wal_checkpoint(PASSIVE)')
  return db
}
