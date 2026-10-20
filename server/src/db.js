import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// SQLite is built into Node 22+, so we need no extra database library.
// Tests pass ':memory:' to get a fresh, throwaway database each time.
export function openDb(file = process.env.DB_FILE || 'data/app.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  // Tables are created here in Step 4 (database + seed data).
  return db
}
