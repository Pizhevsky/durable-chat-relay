import type Database from 'better-sqlite3'

export function initialiseSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      client_chat_id TEXT UNIQUE,
      direct_pair_key TEXT,
      type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
      title TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id),
      FOREIGN KEY (chat_id) REFERENCES chats(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      client_message_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      UNIQUE (sender_id, client_message_id),
      FOREIGN KEY (chat_id) REFERENCES chats(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      origin_node_id TEXT NOT NULL,
      origin_device_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      logical_clock INTEGER NOT NULL,
      sync_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS peer_acks (
      event_id TEXT NOT NULL,
      peer_device_id TEXT NOT NULL,
      acknowledged_at TEXT NOT NULL,
      PRIMARY KEY (event_id, peer_device_id)
    );

    CREATE TABLE IF NOT EXISTS node_sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_direct_pair_key
      ON chats(direct_pair_key)
      WHERE direct_pair_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);
    CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events(sync_status);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);
  `)

  addColumnIfMissing(db, 'chats', 'direct_pair_key', 'direct_pair_key TEXT')

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_direct_pair_key
      ON chats(direct_pair_key)
      WHERE direct_pair_key IS NOT NULL;
  `)
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  if (columns.some((column) => column.name === columnName)) return

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition};`)
}

export function seedDemoUsers(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  if (count.count > 0) return

  const insert = db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)')
  const demoUsers = [
    ['u-denis', 'Denis', 'Senior Engineer'],
    ['u-anna', 'Anna', 'Field Coordinator'],
    ['u-mark', 'Mark', 'Support Engineer'],
    ['u-kate', 'Kate', 'Project Manager'],
    ['u-ivan', 'Ivan', 'Remote Office Lead']
  ]

  const transaction = db.transaction(() => {
    for (const user of demoUsers) {
      insert.run(user[0], user[1], user[2])
    }
  })

  transaction()
}
