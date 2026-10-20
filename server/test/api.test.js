// API tests: the real Express app on a random port, with a fresh in-memory database per test.
// Focus: permissions (403s), required comments, locked requests, and "every action = one history row".
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { seed } from '../src/seed.js'
import { createApp } from '../src/app.js'

// Seeded user ids (see src/seed.js)
const VICTORIA = 1, DANA = 2, DANIEL = 3, MORGAN = 4, JORDAN = 5, ALEX = 6, TAYLOR = 7, ELENA = 8

let db, server, baseUrl

beforeEach(() => {
  db = openDb(':memory:')
  seed(db)
  server = createApp(db).listen(0)
  baseUrl = `http://localhost:${server.address().port}/api`
})

afterEach(() => server.close())

// Calls the API as a given demo user. Returns { status, body }.
// Actions on an existing request need the version the user is looking at. Like the real UI,
// this helper sends the current version automatically, unless the test sets "version" itself.
async function call(userId, method, path, body) {
  const requestId = path.match(/^\/requests\/(\d+)/)?.[1]
  if (method !== 'GET' && requestId && body && !('version' in body)) {
    body = { ...body, version: versionOf(Number(requestId)) }
  }
  const headers = { 'Content-Type': 'application/json' }
  if (userId) headers['X-User-Id'] = String(userId)
  const res = await fetch(baseUrl + path, { method, headers, body: body && JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

const newRequest = (amountCents = 50000) => ({
  vendor: 'Acme Industrial Repair',
  category: 'Repair',
  justification: 'Conveyor motor failed',
  amountCents,
})

async function submitAs(userId, amountCents) {
  const res = await call(userId, 'POST', '/requests', newRequest(amountCents))
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.id
}

const historyCount = (id) => db.prepare('SELECT COUNT(*) AS n FROM request_history WHERE request_id = ?').get(id).n
const statusOf = (id) => db.prepare('SELECT status FROM requests WHERE id = ?').get(id).status
const versionOf = (id) => db.prepare('SELECT version FROM requests WHERE id = ?').get(id)?.version

describe('sign-in', () => {
  test('no user header → 401', async () => {
    assert.equal((await call(null, 'GET', '/requests')).status, 401)
  })

  test('unknown user id → 401', async () => {
    assert.equal((await call(999, 'GET', '/requests')).status, 401)
  })

  test('the user switcher list works without signing in', async () => {
    const res = await call(null, 'GET', '/users')
    assert.equal(res.status, 200)
    assert.equal(res.body.length, 8)
  })
})

describe('every action adds exactly one history row', () => {
  test('submit → edit → approve → send back → resubmit → approve → approve', async () => {
    const id = await submitAs(ALEX, 50000)
    assert.equal(historyCount(id), 1)

    await call(ALEX, 'PUT', `/requests/${id}`, { amountCents: 150000 }) // now needs the director too
    assert.equal(historyCount(id), 2)

    await call(MORGAN, 'POST', `/requests/${id}/approve`, {})
    assert.equal(historyCount(id), 3)

    await call(DANIEL, 'POST', `/requests/${id}/send-back`, { comment: 'Which conveyor?' })
    assert.equal(historyCount(id), 4)

    await call(ALEX, 'PUT', `/requests/${id}`, { justification: 'Conveyor 3 motor failed', comment: 'Added detail' })
    assert.equal(historyCount(id), 5)

    await call(MORGAN, 'POST', `/requests/${id}/approve`, {}) // restarted at step 1
    await call(DANIEL, 'POST', `/requests/${id}/approve`, {})
    assert.equal(historyCount(id), 7)
    assert.equal(statusOf(id), 'approved')

    const { body } = await call(ALEX, 'GET', `/requests/${id}`)
    assert.deepEqual(
      body.history.map((h) => h.action),
      ['submitted', 'edited', 'approved', 'sent_back', 'resubmitted', 'approved', 'approved'],
    )
    assert.deepEqual(body.history[1].changes, { amountCents: [50000, 150000] })
  })

  test('reject and withdraw each add one row', async () => {
    const a = await submitAs(ALEX)
    await call(MORGAN, 'POST', `/requests/${a}/reject`, { comment: 'Use the contracted vendor' })
    assert.equal(historyCount(a), 2)

    const b = await submitAs(ALEX)
    await call(ALEX, 'POST', `/requests/${b}/withdraw`, {})
    assert.equal(historyCount(b), 2)
    assert.equal(statusOf(b), 'withdrawn')
  })

  test('a refused action adds NO history row and changes nothing', async () => {
    const id = await submitAs(ALEX)
    await call(JORDAN, 'POST', `/requests/${id}/approve`, {})
    await call(MORGAN, 'POST', `/requests/${id}/reject`, { comment: '' })
    assert.equal(historyCount(id), 1)
    assert.equal(statusOf(id), 'pending')
  })
})

describe('permissions', () => {
  test('approving a request that is not waiting on you → 403', async () => {
    const id = await submitAs(ALEX) // waiting on Morgan
    const res = await call(JORDAN, 'POST', `/requests/${id}/approve`, {})
    assert.equal(res.status, 403)
    assert.match(res.body.error, /not waiting on you/)
  })

  test('a later-stage approver cannot jump ahead → 403', async () => {
    const id = await submitAs(ALEX, 1400000) // Morgan → Daniel → Victoria
    assert.equal((await call(VICTORIA, 'POST', `/requests/${id}/approve`, {})).status, 403)
    assert.equal((await call(DANIEL, 'POST', `/requests/${id}/approve`, {})).status, 403)
  })

  test('finance cannot approve, reject or send back → 403', async () => {
    const id = await submitAs(ALEX)
    for (const action of ['approve', 'reject', 'send-back']) {
      const res = await call(DANA, 'POST', `/requests/${id}/${action}`, { comment: 'Trying anyway' })
      assert.equal(res.status, 403, action)
    }
  })

  test('finance cannot submit requests → 403', async () => {
    assert.equal((await call(DANA, 'POST', '/requests', newRequest())).status, 403)
  })

  test('editing another person’s request → 403', async () => {
    const id = await submitAs(ALEX)
    assert.equal((await call(MORGAN, 'PUT', `/requests/${id}`, { amountCents: 100 })).status, 403)
    assert.equal((await call(TAYLOR, 'PUT', `/requests/${id}`, { amountCents: 100 })).status, 403)
  })

  test('withdrawing another person’s request → 403', async () => {
    const id = await submitAs(ALEX)
    assert.equal((await call(MORGAN, 'POST', `/requests/${id}/withdraw`, {})).status, 403)
  })

  test('a manager cannot approve their own request → 403', async () => {
    const id = await submitAs(MORGAN) // goes to Daniel; make Morgan Daniel's backup and try anyway
    db.prepare('UPDATE users SET delegate_id = ? WHERE id = ?').run(MORGAN, DANIEL)
    const res = await call(MORGAN, 'POST', `/requests/${id}/approve`, {})
    assert.equal(res.status, 403)
    assert.match(res.body.error, /own request/)
  })

  test('viewing someone else’s request → 403, but Finance and approvers can see it', async () => {
    const id = await submitAs(ALEX)
    assert.equal((await call(TAYLOR, 'GET', `/requests/${id}`)).status, 403)
    assert.equal((await call(JORDAN, 'GET', `/requests/${id}`)).status, 403)
    assert.equal((await call(DANA, 'GET', `/requests/${id}`)).status, 200)
    assert.equal((await call(MORGAN, 'GET', `/requests/${id}`)).status, 200)
  })

  test('the company-wide list is for Finance only → 403 for others', async () => {
    assert.equal((await call(ALEX, 'GET', '/requests?view=all')).status, 403)
    assert.equal((await call(MORGAN, 'GET', '/requests?view=all')).status, 403)
    assert.equal((await call(DANA, 'GET', '/requests?view=all')).status, 200)
    assert.equal((await call(VICTORIA, 'GET', '/requests?view=all')).status, 200)
  })
})

describe('input and state errors', () => {
  test('reject without a reason → 400', async () => {
    const id = await submitAs(ALEX)
    const res = await call(MORGAN, 'POST', `/requests/${id}/reject`, {})
    assert.equal(res.status, 400)
    assert.match(res.body.error, /reason/)
  })

  test('invalid new request → 400', async () => {
    assert.equal((await call(ALEX, 'POST', '/requests', { ...newRequest(), amountCents: 0 })).status, 400)
    assert.equal((await call(ALEX, 'POST', '/requests', { ...newRequest(), vendor: '' })).status, 400)
    assert.equal((await call(ALEX, 'POST', '/requests', {})).status, 400)
  })

  test('acting on a finished request → 409', async () => {
    const id = await submitAs(ALEX)
    await call(MORGAN, 'POST', `/requests/${id}/approve`, {})
    assert.equal((await call(MORGAN, 'POST', `/requests/${id}/approve`, {})).status, 409)
    assert.equal((await call(ALEX, 'PUT', `/requests/${id}`, { amountCents: 100 })).status, 409)
  })

  test('unknown request → 404', async () => {
    assert.equal((await call(ALEX, 'GET', '/requests/999')).status, 404)
    assert.equal((await call(MORGAN, 'POST', '/requests/999/approve', {})).status, 404)
  })
})

describe('top of the org (B4)', () => {
  test('the VP of Finance can submit; the CFO approves it', async () => {
    const id = await submitAs(VICTORIA, 1500000)
    assert.equal((await call(ELENA, 'GET', '/requests?view=inbox')).body[0].id, id)
    assert.equal((await call(ELENA, 'POST', `/requests/${id}/approve`, {})).status, 200)
    assert.equal(statusOf(id), 'approved')
  })

  test('the CFO cannot submit, because nobody is above them', async () => {
    const res = await call(ELENA, 'POST', '/requests', newRequest())
    assert.equal(res.status, 400)
    assert.match(res.body.error, /no eligible approver/i)
  })

  test('the user list tells the UI who has a manager (who can submit)', async () => {
    const users = (await call(null, 'GET', '/users')).body
    assert.equal(users.find((u) => u.id === ELENA).managerId, null)
    assert.equal(users.find((u) => u.id === VICTORIA).managerId, ELENA)
  })
})

describe('one person approves at most one stage (end to end)', () => {
  test('Daniel, as Morgan’s backup, cannot approve stage 1 of a request he approves at stage 2', async () => {
    const id = await submitAs(ALEX, 500000) // Morgan → Daniel
    await call(MORGAN, 'PUT', '/me/delegate', { delegateId: DANIEL })
    const res = await call(DANIEL, 'POST', `/requests/${id}/approve`, {})
    assert.equal(res.status, 403)
    assert.match(res.body.error, /another stage/)
    assert.equal(historyCount(id), 1)
  })

  test('Jordan, covering both Morgan and Daniel, can approve only one of the two stages', async () => {
    const id = await submitAs(ALEX, 500000)
    await call(MORGAN, 'PUT', '/me/delegate', { delegateId: JORDAN })
    await call(DANIEL, 'PUT', '/me/delegate', { delegateId: JORDAN })
    assert.equal((await call(JORDAN, 'POST', `/requests/${id}/approve`, {})).status, 200)
    const second = await call(JORDAN, 'POST', `/requests/${id}/approve`, {})
    assert.equal(second.status, 403)
    assert.match(second.body.error, /already approved/)
    assert.equal((await call(DANIEL, 'POST', `/requests/${id}/approve`, {})).status, 200) // Daniel himself still can
  })
})

describe('outdated screens (version check)', () => {
  test('the $900 → $9,000 case: an approval based on the old version is refused', async () => {
    const id = await submitAs(ALEX, 90000)
    const morganSaw = versionOf(id) // Morgan opens the $900 request...

    await call(ALEX, 'PUT', `/requests/${id}`, { amountCents: 900000 }) // ...Alex raises it to $9,000...

    const res = await call(MORGAN, 'POST', `/requests/${id}/approve`, { version: morganSaw }) // ...Morgan clicks Approve
    assert.equal(res.status, 409)
    assert.match(res.body.error, /changed since you opened it/)
    assert.equal(historyCount(id), 2) // submitted + edited, but NO approval
    assert.equal((await call(MORGAN, 'GET', `/requests/${id}`)).body.currentStep, 1)
  })

  test('after reloading, the approver can act on the new version', async () => {
    const id = await submitAs(ALEX, 90000)
    await call(ALEX, 'PUT', `/requests/${id}`, { amountCents: 900000 })
    const fresh = (await call(MORGAN, 'GET', `/requests/${id}`)).body
    assert.equal((await call(MORGAN, 'POST', `/requests/${id}/approve`, { version: fresh.version })).status, 200)
  })

  test('two people acting on the same version: the second one is refused', async () => {
    const id = await submitAs(ALEX)
    db.prepare('UPDATE users SET delegate_id = ? WHERE id = ?').run(JORDAN, MORGAN) // Jordan covers Morgan
    const v = versionOf(id)
    assert.equal((await call(MORGAN, 'POST', `/requests/${id}/send-back`, { version: v, comment: 'Need quote' })).status, 200)
    assert.equal((await call(JORDAN, 'POST', `/requests/${id}/approve`, { version: v })).status, 409)
    assert.equal(statusOf(id), 'sent_back')
  })

  test('the requester editing from an outdated screen is refused too', async () => {
    const id = await submitAs(ALEX)
    const v = versionOf(id)
    await call(ALEX, 'PUT', `/requests/${id}`, { vendor: 'First edit' })
    assert.equal((await call(ALEX, 'PUT', `/requests/${id}`, { vendor: 'Second edit', version: v })).status, 409)
  })

  test('an action without a version → 400', async () => {
    const id = await submitAs(ALEX)
    const res = await call(MORGAN, 'POST', `/requests/${id}/approve`, { version: undefined })
    assert.equal(res.status, 400)
    assert.match(res.body.error, /version/)
  })

  test('the database layer refuses a stale save and rolls everything back', async () => {
    const { applyResult } = await import('../src/store.js')
    const id = await submitAs(ALEX)
    const fakeResult = {
      updates: { status: 'approved', currentStep: null },
      history: { action: 'approved', actorId: MORGAN, onBehalfOfId: null, comment: null, changes: null },
    }
    assert.throws(() => applyResult(db, id, fakeResult, versionOf(id) - 1), /changed since you opened it/)
    assert.equal(statusOf(id), 'pending')
    assert.equal(historyCount(id), 1) // the history insert was rolled back with the update
  })
})

describe('vacation backup (Marcus)', () => {
  test('full flow: Morgan picks Jordan, Jordan approves on Morgan’s behalf, Morgan comes back', async () => {
    const id = await submitAs(ALEX) // waiting on Morgan

    // Morgan goes on vacation and names Jordan as backup.
    const set = await call(MORGAN, 'PUT', '/me/delegate', { delegateId: JORDAN })
    assert.equal(set.status, 200)
    assert.equal(set.body.delegateName, 'Jordan Blake')

    // Jordan now sees it in their inbox and approves it.
    assert.deepEqual((await call(JORDAN, 'GET', '/requests?view=inbox')).body.map((r) => r.id), [id])
    assert.equal((await call(JORDAN, 'POST', `/requests/${id}/approve`, {})).status, 200)

    // History: Jordan approved on behalf of Morgan.
    const approval = (await call(ALEX, 'GET', `/requests/${id}`)).body.history.at(-1)
    assert.equal(approval.actorName, 'Jordan Blake')
    assert.equal(approval.onBehalfOfName, 'Morgan Lee')

    // Morgan comes back: Jordan no longer sees Morgan's new requests.
    assert.equal((await call(MORGAN, 'PUT', '/me/delegate', { delegateId: null })).body.delegateName, null)
    await submitAs(ALEX)
    assert.deepEqual((await call(JORDAN, 'GET', '/requests?view=inbox')).body, [])
  })

  test('requests already waiting move to the backup immediately, and back when cleared', async () => {
    const id = await submitAs(ALEX)
    await call(MORGAN, 'PUT', '/me/delegate', { delegateId: JORDAN })
    assert.equal((await call(JORDAN, 'GET', '/requests?view=inbox')).body[0].id, id)
    await call(MORGAN, 'PUT', '/me/delegate', { delegateId: null })
    assert.deepEqual((await call(JORDAN, 'GET', '/requests?view=inbox')).body, [])
    assert.equal((await call(JORDAN, 'POST', `/requests/${id}/approve`, {})).status, 403)
  })

  test('invalid backups are refused', async () => {
    assert.equal((await call(MORGAN, 'PUT', '/me/delegate', { delegateId: MORGAN })).status, 400) // self
    assert.equal((await call(MORGAN, 'PUT', '/me/delegate', { delegateId: ALEX })).status, 400) // not an approver
    assert.equal((await call(MORGAN, 'PUT', '/me/delegate', { delegateId: DANA })).status, 400) // finance
    assert.equal((await call(MORGAN, 'PUT', '/me/delegate', { delegateId: 999 })).status, 400) // unknown
    assert.equal((await call(ALEX, 'PUT', '/me/delegate', { delegateId: MORGAN })).status, 403) // employees approve nothing
    assert.equal((await call(DANA, 'PUT', '/me/delegate', { delegateId: MORGAN })).status, 403) // finance approves nothing
  })
})

describe('lists', () => {
  test('inbox shows only what is waiting on me', async () => {
    const id = await submitAs(ALEX)
    assert.deepEqual((await call(MORGAN, 'GET', '/requests?view=inbox')).body.map((r) => r.id), [id])
    assert.deepEqual((await call(JORDAN, 'GET', '/requests?view=inbox')).body, [])
  })

  test('a delegate sees the away approver’s inbox items', async () => {
    const id = await submitAs(ALEX)
    db.prepare('UPDATE users SET delegate_id = ? WHERE id = ?').run(JORDAN, MORGAN)
    const inbox = (await call(JORDAN, 'GET', '/requests?view=inbox')).body
    assert.deepEqual(inbox.map((r) => r.id), [id])
    assert.equal(inbox[0].coveringDelegateName, 'Jordan Blake')
  })

  test('reviewed shows requests I approved, rejected or sent back, and keeps them after they move on', async () => {
    const approved = await submitAs(ALEX, 500000) // Morgan → Daniel
    const rejected = await submitAs(ALEX)
    const sentBack = await submitAs(ALEX)
    const untouched = await submitAs(ALEX)
    await call(MORGAN, 'POST', `/requests/${approved}/approve`, {}) // now waiting on Daniel
    await call(MORGAN, 'POST', `/requests/${rejected}/reject`, { comment: 'No' })
    await call(MORGAN, 'POST', `/requests/${sentBack}/send-back`, { comment: 'Quote?' })

    const reviewed = (await call(MORGAN, 'GET', '/requests?view=reviewed')).body.map((r) => r.id)
    assert.deepEqual(reviewed.sort(), [approved, rejected, sentBack].sort())
    assert.ok(!reviewed.includes(untouched))
    assert.deepEqual((await call(DANIEL, 'GET', '/requests?view=reviewed')).body, [])
  })

  test('reviewed includes decisions a backup made on my behalf (for both of us)', async () => {
    const id = await submitAs(ALEX)
    db.prepare('UPDATE users SET delegate_id = ? WHERE id = ?').run(JORDAN, MORGAN)
    await call(JORDAN, 'POST', `/requests/${id}/approve`, {})
    db.prepare('UPDATE users SET delegate_id = NULL WHERE id = ?').run(MORGAN) // Morgan is back

    assert.deepEqual((await call(JORDAN, 'GET', '/requests?view=reviewed')).body.map((r) => r.id), [id])
    assert.deepEqual((await call(MORGAN, 'GET', '/requests?view=reviewed')).body.map((r) => r.id), [id])
    assert.equal((await call(MORGAN, 'GET', `/requests/${id}`)).status, 200) // and can open it
  })

  test('submitting or editing does not count as reviewing', async () => {
    const id = await submitAs(ALEX)
    await call(ALEX, 'PUT', `/requests/${id}`, { vendor: 'Changed' })
    assert.deepEqual((await call(ALEX, 'GET', '/requests?view=reviewed')).body, [])
  })

  test('mine shows only my requests, with status and current approver', async () => {
    await submitAs(ALEX)
    await submitAs(TAYLOR)
    const mine = (await call(ALEX, 'GET', '/requests?view=mine')).body
    assert.equal(mine.length, 1)
    assert.equal(mine[0].status, 'pending')
    assert.equal(mine[0].currentApproverName, 'Morgan Lee')
  })

  test('finance can search and filter the company-wide list', async () => {
    await submitAs(ALEX) // Operations
    const taylorId = await submitAs(TAYLOR) // Warehouse
    await call(TAYLOR, 'POST', `/requests/${taylorId}/withdraw`, {})

    const all = async (query) => (await call(DANA, 'GET', `/requests?view=all${query}`)).body
    assert.equal((await all('')).length, 2)
    assert.equal((await all('&status=withdrawn')).length, 1)
    assert.equal((await all('&departmentId=2'))[0].requesterName, 'Taylor Brooks')
    assert.equal((await all('&q=taylor')).length, 1)
    assert.equal((await all('&q=acme')).length, 2)
    assert.equal((await all('&q=nothing-matches')).length, 0)
  })
})
