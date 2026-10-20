import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { seed, isEmpty } from '../src/seed.js'

function seededDb() {
  const db = openDb(':memory:')
  seed(db)
  return db
}

// A minimal request with one history row, for the audit tests.
function addRequestWithHistory(db) {
  const { lastInsertRowid: requestId } = db
    .prepare(
      `INSERT INTO requests (requester_id, vendor, category, justification, amount_cents, status)
       VALUES (6, 'Acme Industrial Repair', 'Repair', 'Conveyor motor failed', 50000, 'pending')`,
    )
    .run()
  db.prepare(`INSERT INTO request_history (request_id, action, actor_id) VALUES (?, 'submitted', 6)`).run(requestId)
  return requestId
}

test('seed creates the demo org with users for every role', () => {
  const db = seededDb()
  const roles = db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all()
  const count = Object.fromEntries(roles.map((r) => [r.role, r.n]))
  assert.deepEqual(count, { director: 1, employee: 2, finance: 1, manager: 2, vp_finance: 1 })
})

test('every department has a director and every non-VP user has a manager', () => {
  const db = seededDb()
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM departments WHERE director_id IS NULL').get().n, 0)
  const noManager = db.prepare('SELECT role FROM users WHERE manager_id IS NULL').all()
  assert.deepEqual(noManager.map((u) => u.role), ['vp_finance'])
})

test('isEmpty is true before seeding and false after', () => {
  const db = openDb(':memory:')
  assert.equal(isEmpty(db), true)
  seed(db)
  assert.equal(isEmpty(db), false)
})

test('history rows cannot be updated (append-only, enforced by the database)', () => {
  const db = seededDb()
  const requestId = addRequestWithHistory(db)
  assert.throws(
    () => db.prepare(`UPDATE request_history SET actor_id = 4 WHERE request_id = ?`).run(requestId),
    /append-only/,
  )
})

test('history rows cannot be deleted (append-only, enforced by the database)', () => {
  const db = seededDb()
  const requestId = addRequestWithHistory(db)
  assert.throws(() => db.prepare('DELETE FROM request_history WHERE request_id = ?').run(requestId), /append-only/)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM request_history').get().n, 1)
})

test('the database rejects bad data even if the code forgets to check', () => {
  const db = seededDb()
  const insert = (amount, status) =>
    db
      .prepare(
        `INSERT INTO requests (requester_id, vendor, category, justification, amount_cents, status)
         VALUES (6, 'Vendor', 'Other', 'Reason', ?, ?)`,
      )
      .run(amount, status)

  assert.throws(() => insert(0, 'pending'), /CHECK constraint/) // amount must be > 0
  assert.throws(() => insert(100, 'lost'), /CHECK constraint/) // unknown status
  assert.throws(() => db.prepare('UPDATE users SET delegate_id = id WHERE id = 4').run(), /CHECK constraint/) // own delegate
})
