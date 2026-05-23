import type Database from 'better-sqlite3'

export class SyncStateStore {
  constructor(private readonly db: Database.Database) {}

  getCursor(key: string): number {
    const row = this.db
      .prepare('SELECT value FROM node_sync_state WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row ? Number(row.value) : 0
  }

  setCursor(key: string, value: number): void {
    this.db.prepare(`
      INSERT INTO node_sync_state (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value))
  }
}
