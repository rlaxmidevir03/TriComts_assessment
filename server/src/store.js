// All SQL for requests lives here. The routes call these functions; the rules live in workflow.js.
// The database uses snake_case columns; everything returned from here is camelCase.
import { transaction } from './db.js'
import { WorkflowError } from './workflow.js'

export const STALE_MESSAGE = 'This request was changed since you opened it. Please reload it and try again.'

// ---------- Reading ----------

export function getUser(db, id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  return row ? toUser(row) : null
}

// The org chart, as workflow.js expects it.
export function loadOrg(db) {
  return {
    users: db.prepare('SELECT * FROM users').all().map(toUser),
    departments: db
      .prepare('SELECT id, name, director_id FROM departments')
      .all()
      .map((d) => ({ id: d.id, name: d.name, directorId: d.director_id })),
  }
}

// One request with its approval route (approver names included), or null.
export function getRequest(db, id) {
  const row = db.prepare(`${LIST_SELECT} WHERE r.id = ?`).get(id)
  if (!row) return null
  const steps = db
    .prepare(
      `SELECT s.step_no, s.level, s.approver_id, u.name AS approver_name
       FROM approval_steps s JOIN users u ON u.id = s.approver_id
       WHERE s.request_id = ? ORDER BY s.step_no`,
    )
    .all(id)
    .map((s) => ({ stepNo: s.step_no, level: s.level, approverId: s.approver_id, approverName: s.approver_name }))
  return { ...toRequest(row), steps }
}

// The full audit trail for a request, oldest first.
export function getHistory(db, requestId) {
  return db
    .prepare(
      `SELECT h.*, a.name AS actor_name, b.name AS on_behalf_of_name
       FROM request_history h
       JOIN users a ON a.id = h.actor_id
       LEFT JOIN users b ON b.id = h.on_behalf_of_id
       WHERE h.request_id = ? ORDER BY h.id`,
    )
    .all(requestId)
    .map((h) => ({
      id: h.id,
      action: h.action,
      actorId: h.actor_id,
      actorName: h.actor_name,
      onBehalfOfId: h.on_behalf_of_id,
      onBehalfOfName: h.on_behalf_of_name,
      comment: h.comment,
      changes: h.changes ? JSON.parse(h.changes) : null,
      createdAt: h.created_at,
    }))
}

// Lists for the three views (US-9, US-10, US-12). Filters only apply to the "all" view.
export function listRequests(db, { view, user, q, status, departmentId }) {
  const where = []
  const params = []

  if (view === 'mine') {
    where.push('r.requester_id = ?')
    params.push(user.id)
  } else if (view === 'inbox') {
    // Waiting on me, or on someone I'm covering for, but never my own request.
    where.push(`r.status = 'pending' AND (a.id = ? OR a.delegate_id = ?) AND r.requester_id <> ?`)
    params.push(user.id, user.id, user.id)
  } else if (view === 'reviewed') {
    // Requests I approved, rejected or sent back, or that my backup decided on my behalf (G1).
    where.push(`r.id IN (SELECT request_id FROM request_history
                         WHERE action IN ('approved', 'rejected', 'sent_back')
                           AND (actor_id = ? OR on_behalf_of_id = ?))`)
    params.push(user.id, user.id)
  } else {
    if (q) {
      where.push('(r.vendor LIKE ? OR r.justification LIKE ? OR u.name LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    if (status) {
      where.push('r.status = ?')
      params.push(status)
    }
    if (departmentId) {
      where.push('d.id = ?')
      params.push(departmentId)
    }
  }

  const sql = `${LIST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.id DESC`
  return db.prepare(sql).all(...params).map(toRequest)
}

// Has this user ever acted on the request, or had a backup act for them? (Lets past approvers keep seeing it.)
export function hasActedOn(db, userId, requestId) {
  return !!db
    .prepare('SELECT 1 FROM request_history WHERE request_id = ? AND (actor_id = ? OR on_behalf_of_id = ?)')
    .get(requestId, userId, userId)
}

export function listDepartments(db) {
  return db.prepare('SELECT id, name FROM departments ORDER BY name').all()
}

// ---------- Writing ----------

// Set or clear (null) who covers for this user while they're away.
export function setDelegate(db, userId, delegateId) {
  db.prepare('UPDATE users SET delegate_id = ? WHERE id = ?').run(delegateId, userId)
}
// A workflow result is { updates, steps?, history }. Each write below saves the request change,
// the route (if rebuilt) and exactly one history row in ONE transaction, so you can never get
// a status change without its audit entry, or the other way round.

export function createRequest(db, requesterId, result) {
  return transaction(db, () => {
    const u = result.updates
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO requests (requester_id, vendor, category, justification, amount_cents, status, current_step, waiting_since)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(requesterId, u.vendor, u.category, u.justification, u.amountCents, u.status, u.currentStep, now())
    const id = Number(lastInsertRowid)
    saveSteps(db, id, result.steps)
    addHistory(db, id, result.history)
    return id
  })
}

// expectedVersion is the version the user was looking at. The UPDATE only matches if the
// request still has that version, so a change based on an outdated screen can never be saved,
// even if two clicks arrive at the same moment (optimistic locking).
export function applyResult(db, requestId, result, expectedVersion) {
  transaction(db, () => {
    const columns = { status: 'status', currentStep: 'current_step', vendor: 'vendor', category: 'category', justification: 'justification', amountCents: 'amount_cents' }
    const sets = ['version = version + 1', 'updated_at = ?', 'waiting_since = ?']
    // A new step starts the "days waiting" clock again; a finished request isn't waiting on anyone.
    const params = [now(), result.updates.currentStep ? now() : null]
    for (const [key, value] of Object.entries(result.updates)) {
      sets.push(`${columns[key]} = ?`)
      params.push(value)
    }
    const { changes } = db
      .prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ? AND version = ?`)
      .run(...params, requestId, expectedVersion)
    if (changes === 0) throw new WorkflowError('conflict', STALE_MESSAGE) // rolls back: nothing is saved

    if (result.steps) {
      // The route is working state, so it can be replaced. The history table keeps what happened.
      db.prepare('DELETE FROM approval_steps WHERE request_id = ?').run(requestId)
      saveSteps(db, requestId, result.steps)
    }
    addHistory(db, requestId, result.history)
  })
}

function saveSteps(db, requestId, steps) {
  const insert = db.prepare('INSERT INTO approval_steps (request_id, step_no, level, approver_id) VALUES (?, ?, ?, ?)')
  for (const s of steps) insert.run(requestId, s.stepNo, s.level, s.approverId)
}

function addHistory(db, requestId, h) {
  db.prepare(
    `INSERT INTO request_history (request_id, action, actor_id, on_behalf_of_id, comment, changes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(requestId, h.action, h.actorId, h.onBehalfOfId, h.comment, h.changes ? JSON.stringify(h.changes) : null)
}

// ---------- Row mapping ----------

// Request + requester + department + current approver (+ who's covering for them).
const LIST_SELECT = `
  SELECT r.*, u.name AS requester_name, d.id AS department_id, d.name AS department_name,
         a.id AS approver_id, a.name AS approver_name, del.id AS delegate_id, del.name AS delegate_name
  FROM requests r
  JOIN users u ON u.id = r.requester_id
  JOIN departments d ON d.id = u.department_id
  LEFT JOIN approval_steps s ON s.request_id = r.id AND s.step_no = r.current_step
  LEFT JOIN users a ON a.id = s.approver_id
  LEFT JOIN users del ON del.id = a.delegate_id`

const DAY_MS = 24 * 60 * 60 * 1000

function toRequest(r) {
  return {
    id: r.id,
    requesterId: r.requester_id,
    requesterName: r.requester_name,
    departmentId: r.department_id,
    departmentName: r.department_name,
    vendor: r.vendor,
    category: r.category,
    justification: r.justification,
    amountCents: r.amount_cents,
    status: r.status,
    currentStep: r.current_step,
    currentApproverId: r.approver_id,
    currentApproverName: r.approver_name,
    coveringDelegateId: r.delegate_id, // set when the current approver is away
    coveringDelegateName: r.delegate_name,
    daysWaiting: r.waiting_since ? Math.floor((Date.now() - Date.parse(r.waiting_since)) / DAY_MS) : null,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.department_id,
    managerId: u.manager_id,
    delegateId: u.delegate_id,
  }
}

function now() {
  return new Date().toISOString()
}
