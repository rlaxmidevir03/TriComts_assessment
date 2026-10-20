import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// SQLite is built into Node 22+, so we need no extra database library.
// Tests pass ':memory:' to get a fresh, throwaway database each time.
export function openDb(file = process.env.DB_FILE || 'data/app.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

// Runs fn inside a transaction: either everything it writes is saved, or (on any error) nothing is.
export function transaction(db, fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// Timestamps are stored as ISO text in UTC, e.g. 2026-10-20T14:05:09.123Z
const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

// Tables from docs/design.md section 2. "IF NOT EXISTS" makes this safe to run on every start.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  director_id INTEGER REFERENCES users(id)   -- approves stage 2 for this department
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,         -- Microsoft sign-in will match users on this later
  role          TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'director', 'vp_finance', 'cfo', 'finance')),
  department_id INTEGER NOT NULL REFERENCES departments(id),
  manager_id    INTEGER REFERENCES users(id),
  delegate_id   INTEGER REFERENCES users(id), -- set = "I'm away, this person covers me"
  CHECK (delegate_id IS NULL OR delegate_id <> id)
);

CREATE TABLE IF NOT EXISTS requests (
  id            INTEGER PRIMARY KEY,
  requester_id  INTEGER NOT NULL REFERENCES users(id),
  vendor        TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('Rush order', 'Repair', 'New vendor', 'Other')),
  justification TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),  -- whole cents: $1,250.50 = 125050
  status        TEXT NOT NULL CHECK (status IN ('pending', 'sent_back', 'approved', 'rejected', 'withdrawn')),
  current_step  INTEGER,                      -- active approval step; NULL when not pending
  waiting_since TEXT,                         -- when the current step started ("days waiting")
  version       INTEGER NOT NULL DEFAULT 1,   -- +1 on every change, to catch outdated screens
  created_at    TEXT NOT NULL DEFAULT ${NOW},
  updated_at    TEXT NOT NULL DEFAULT ${NOW}
);

-- The approval route for the current round. Working state, rebuilt on edit/resubmit.
CREATE TABLE IF NOT EXISTS approval_steps (
  request_id  INTEGER NOT NULL REFERENCES requests(id),
  step_no     INTEGER NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('manager', 'director', 'vp')),
  approver_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (request_id, step_no)
);

-- The audit trail. Rows are only ever inserted (see triggers below).
CREATE TABLE IF NOT EXISTS request_history (
  id              INTEGER PRIMARY KEY,
  request_id      INTEGER NOT NULL REFERENCES requests(id),
  action          TEXT NOT NULL CHECK (action IN
                    ('submitted', 'edited', 'resubmitted', 'approved', 'rejected', 'sent_back', 'withdrawn')),
  actor_id        INTEGER NOT NULL REFERENCES users(id),
  on_behalf_of_id INTEGER REFERENCES users(id), -- set when a delegate acted
  comment         TEXT,
  changes         TEXT,                         -- JSON of old -> new values for edits
  created_at      TEXT NOT NULL DEFAULT ${NOW}
);

-- Priya's rule enforced by the database itself: history can never be changed or removed,
-- even if application code has a bug.
CREATE TRIGGER IF NOT EXISTS history_no_update BEFORE UPDATE ON request_history
BEGIN SELECT RAISE(ABORT, 'request_history is append-only'); END;

CREATE TRIGGER IF NOT EXISTS history_no_delete BEFORE DELETE ON request_history
BEGIN SELECT RAISE(ABORT, 'request_history is append-only'); END;
`
