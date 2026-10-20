// Tests for the approval rules in src/workflow.js.
// Written BEFORE the code (test-first). Each test names the requirement it proves (see docs/requirements.md).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRoute,
  submit,
  approve,
  reject,
  sendBack,
  edit,
  withdraw,
  checkDelegate,
  WorkflowError,
} from '../src/workflow.js'

// ---------- A small org that mirrors the seed data ----------
//   Elena (CFO) ── Victoria (VP) ── Dana (finance), Daniel (director of Operations + Warehouse)
//   Daniel ── Morgan (manager, Ops) ── Alex (employee)
//          └─ Jordan (manager, Warehouse) ── Taylor (employee)
const users = [
  { id: 1, name: 'Victoria Hale', role: 'vp_finance', departmentId: 3, managerId: 8, delegateId: null },
  { id: 2, name: 'Dana Whitfield', role: 'finance', departmentId: 3, managerId: 1, delegateId: null },
  { id: 3, name: 'Daniel Ortiz', role: 'director', departmentId: 1, managerId: 1, delegateId: null },
  { id: 4, name: 'Morgan Lee', role: 'manager', departmentId: 1, managerId: 3, delegateId: null },
  { id: 5, name: 'Jordan Blake', role: 'manager', departmentId: 2, managerId: 3, delegateId: null },
  { id: 6, name: 'Alex Chen', role: 'employee', departmentId: 1, managerId: 4, delegateId: null },
  { id: 7, name: 'Taylor Brooks', role: 'employee', departmentId: 2, managerId: 5, delegateId: null },
  { id: 8, name: 'Elena Marsh', role: 'cfo', departmentId: 3, managerId: null, delegateId: null },
]
const departments = [
  { id: 1, directorId: 3 },
  { id: 2, directorId: 3 },
  { id: 3, directorId: 1 },
]
const org = { users, departments }
const [victoria, dana, daniel, morgan, jordan, alex, , elena] = users

// Marks some people as away with a backup, e.g. away({ [morgan.id]: jordan.id }).
const away = (backups) => ({
  ...org,
  users: users.map((u) => (backups[u.id] ? { ...u, delegateId: backups[u.id] } : u)),
})

const fields = (amountCents) => ({
  vendor: 'Acme Industrial Repair',
  category: 'Repair',
  justification: 'Conveyor motor failed',
  amountCents,
})

// Submits a request and returns it in the shape the database layer would hand back.
function pendingRequest(requester, amountCents) {
  const result = submit(requester, fields(amountCents), org)
  return { id: 1, requesterId: requester.id, ...result.updates, steps: result.steps, approvedThisRound: [] }
}

// Applies a workflow result to a request, like the database layer will.
// approvedThisRound = who has approved since the last submit/edit (the store works it out from history).
function applied(request, result) {
  const { action, actorId } = result.history
  const approvedThisRound = action === 'approved' ? [...request.approvedThisRound, actorId] : result.steps ? [] : request.approvedThisRound
  return { ...request, ...result.updates, steps: result.steps ?? request.steps, approvedThisRound }
}

const approverIds = (steps) => steps.map((s) => s.approverId)

// assert.throws helper: checks the error type, its kind and part of the message.
function throwsWorkflow(fn, kind, messagePart) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof WorkflowError, `expected WorkflowError, got ${err}`)
    assert.equal(err.kind, kind)
    if (messagePart) assert.match(err.message, messagePart)
    return true
  })
}

// ---------- Routing by amount (A1, A2, US-2) ----------
describe('routing by amount', () => {
  test('$999.99 needs only the manager', () => {
    assert.deepEqual(buildRoute(alex, 99999, org), [{ stepNo: 1, level: 'manager', approverId: morgan.id }])
  })

  test('exactly $1,000.00 adds the department director', () => {
    assert.deepEqual(approverIds(buildRoute(alex, 100000, org)), [morgan.id, daniel.id])
  })

  test('$9,999.99 still needs only manager and director', () => {
    assert.deepEqual(approverIds(buildRoute(alex, 999999, org)), [morgan.id, daniel.id])
  })

  test('exactly $10,000.00 adds the VP of Finance', () => {
    const route = buildRoute(alex, 1000000, org)
    assert.deepEqual(approverIds(route), [morgan.id, daniel.id, victoria.id])
    assert.deepEqual(route.map((s) => s.level), ['manager', 'director', 'vp'])
  })
})

// ---------- Nobody approves their own request (B1–B4, US-6) ----------
describe('no self-approval in the route', () => {
  test('a manager’s request goes to their own manager; one approval covers manager + director (B2)', () => {
    // Morgan's manager IS the director, so Daniel appears once, at the higher level.
    assert.deepEqual(buildRoute(morgan, 500000, org), [{ stepNo: 1, level: 'director', approverId: daniel.id }])
  })

  test('a director’s request skips up past themselves to the VP (B3)', () => {
    assert.deepEqual(buildRoute(daniel, 500000, org), [{ stepNo: 1, level: 'director', approverId: victoria.id }])
    assert.deepEqual(buildRoute(daniel, 1500000, org), [{ stepNo: 1, level: 'vp', approverId: victoria.id }])
  })

  test('the VP of Finance’s own requests go to the CFO, at any amount (B4)', () => {
    assert.deepEqual(approverIds(buildRoute(victoria, 50000, org)), [elena.id])
    assert.deepEqual(approverIds(buildRoute(victoria, 1500000, org)), [elena.id])
  })

  test('the CFO is the top of the org: nobody can approve their requests, so they are refused', () => {
    throwsWorkflow(() => buildRoute(elena, 50000, org), 'invalid', /no eligible approver/i)
  })

  test('no requester is ever in their own route, for any user and amount', () => {
    for (const requester of users.filter((u) => u.managerId)) {
      for (const amount of [100, 99999, 100000, 999999, 1000000, 5000000]) {
        const route = buildRoute(requester, amount, org)
        assert.ok(!approverIds(route).includes(requester.id), `${requester.name} at ${amount}`)
        assert.equal(new Set(approverIds(route)).size, route.length, 'no person twice')
      }
    }
  })
})

// ---------- Submitting (US-1) ----------
describe('submit', () => {
  test('creates a pending request at step 1 and a "submitted" history entry', () => {
    const result = submit(alex, fields(50000), org)
    assert.deepEqual(result.updates, { ...fields(50000), status: 'pending', currentStep: 1 })
    assert.deepEqual(approverIds(result.steps), [morgan.id])
    assert.deepEqual(result.history, { action: 'submitted', actorId: alex.id, onBehalfOfId: null, comment: null, changes: null })
  })

  test('finance viewers cannot submit (they are read-only)', () => {
    throwsWorkflow(() => submit(dana, fields(50000), org), 'forbidden')
  })

  test('rejects missing or invalid fields', () => {
    throwsWorkflow(() => submit(alex, { ...fields(50000), vendor: '  ' }, org), 'invalid', /vendor/i)
    throwsWorkflow(() => submit(alex, { ...fields(50000), justification: '' }, org), 'invalid', /reason/i)
    throwsWorkflow(() => submit(alex, { ...fields(50000), category: 'Snacks' }, org), 'invalid', /category/i)
    throwsWorkflow(() => submit(alex, fields(0), org), 'invalid', /amount/i)
    throwsWorkflow(() => submit(alex, fields(-500), org), 'invalid', /amount/i)
    throwsWorkflow(() => submit(alex, fields(12.5), org), 'invalid', /amount/i) // must be whole cents
  })
})

// ---------- Approve (US-3) ----------
describe('approve', () => {
  test('the only approver approving makes the request Approved', () => {
    const result = approve(morgan, pendingRequest(alex, 50000), org)
    assert.deepEqual(result.updates, { status: 'approved', currentStep: null })
    assert.equal(result.history.action, 'approved')
    assert.equal(result.history.actorId, morgan.id)
  })

  test('approving a multi-step request moves it to the next step', () => {
    const request = pendingRequest(alex, 500000)
    const afterManager = applied(request, approve(morgan, request, org))
    assert.deepEqual({ status: afterManager.status, currentStep: afterManager.currentStep }, { status: 'pending', currentStep: 2 })

    const afterDirector = applied(afterManager, approve(daniel, afterManager, org))
    assert.equal(afterDirector.status, 'approved')
  })

  test('a $14,000 request needs all three approvals, in order', () => {
    let request = pendingRequest(alex, 1400000)
    throwsWorkflow(() => approve(victoria, request, org), 'forbidden') // VP can't jump the queue
    request = applied(request, approve(morgan, request, org))
    request = applied(request, approve(daniel, request, org))
    assert.equal(request.status, 'pending')
    request = applied(request, approve(victoria, request, org))
    assert.equal(request.status, 'approved')
  })

  test('someone who is not the current approver cannot approve', () => {
    throwsWorkflow(() => approve(jordan, pendingRequest(alex, 50000), org), 'forbidden')
  })

  test('an optional comment is kept in the history', () => {
    const result = approve(morgan, pendingRequest(alex, 50000), org, 'Vendor quote looks fair')
    assert.equal(result.history.comment, 'Vendor quote looks fair')
  })
})

// ---------- Reject and send back (US-4, US-5, C2) ----------
describe('reject and send back', () => {
  test('reject without a reason is refused', () => {
    throwsWorkflow(() => reject(morgan, pendingRequest(alex, 50000), org, ''), 'invalid', /reason/i)
    throwsWorkflow(() => reject(morgan, pendingRequest(alex, 50000), org, '   '), 'invalid', /reason/i)
  })

  test('reject with a reason makes the request Rejected', () => {
    const result = reject(morgan, pendingRequest(alex, 50000), org, 'Use the contracted vendor')
    assert.deepEqual(result.updates, { status: 'rejected', currentStep: null })
    assert.equal(result.history.comment, 'Use the contracted vendor')
  })

  test('send back without a comment is refused', () => {
    throwsWorkflow(() => sendBack(morgan, pendingRequest(alex, 50000), org, ''), 'invalid', /comment/i)
  })

  test('send back with a comment returns it to the requester', () => {
    const result = sendBack(morgan, pendingRequest(alex, 50000), org, 'Please attach the quote number')
    assert.deepEqual(result.updates, { status: 'sent_back', currentStep: null })
    assert.equal(result.history.action, 'sent_back')
  })
})

// ---------- Finance is read-only, no self-approval when acting (US-6) ----------
describe('who may act', () => {
  test('finance viewers cannot approve, reject or send back', () => {
    const request = pendingRequest(alex, 50000)
    const coveredByDana = { ...org, users: users.map((u) => (u.id === morgan.id ? { ...u, delegateId: dana.id } : u)) }
    throwsWorkflow(() => approve(dana, request, coveredByDana), 'forbidden', /finance/i)
    throwsWorkflow(() => reject(dana, request, coveredByDana, 'No'), 'forbidden', /finance/i)
    throwsWorkflow(() => sendBack(dana, request, coveredByDana, 'Why?'), 'forbidden', /finance/i)
  })

  test('a delegate can act for an away approver, and history says "on behalf of"', () => {
    const away = { ...org, users: users.map((u) => (u.id === morgan.id ? { ...u, delegateId: jordan.id } : u)) }
    const result = approve(jordan, pendingRequest(alex, 50000), away)
    assert.equal(result.history.actorId, jordan.id)
    assert.equal(result.history.onBehalfOfId, morgan.id)
  })

  test('the approver can still act while they have a delegate', () => {
    const away = { ...org, users: users.map((u) => (u.id === morgan.id ? { ...u, delegateId: jordan.id } : u)) }
    assert.equal(approve(morgan, pendingRequest(alex, 50000), away).history.onBehalfOfId, null)
  })

  test('a delegate can never approve their OWN request', () => {
    // Morgan names Alex as backup, then Alex's own request lands on Morgan.
    const away = { ...org, users: users.map((u) => (u.id === morgan.id ? { ...u, delegateId: alex.id } : u)) }
    throwsWorkflow(() => approve(alex, pendingRequest(alex, 50000), away), 'forbidden', /own request/i)
  })
})

// ---------- Editing and resubmitting (US-5, US-7, C3, D1–D4) ----------
describe('edit and resubmit', () => {
  test('editing restarts approval at step 1, even if some steps were already approved', () => {
    let request = pendingRequest(alex, 500000)
    request = applied(request, approve(morgan, request, org)) // now at step 2
    const result = edit(alex, request, { justification: 'Motor and belt both failed' }, org)
    assert.equal(result.updates.currentStep, 1)
    assert.equal(result.updates.status, 'pending')
    assert.equal(result.history.action, 'edited')
  })

  test('raising the amount reroutes it ($900 approved → $9,000 needs the director too)', () => {
    const request = pendingRequest(alex, 90000)
    const result = edit(alex, request, { amountCents: 900000 }, org)
    assert.deepEqual(approverIds(result.steps), [morgan.id, daniel.id])
    assert.deepEqual(result.history.changes, { amountCents: [90000, 900000] })
  })

  test('history records only the fields that actually changed (old → new)', () => {
    const result = edit(alex, pendingRequest(alex, 50000), { vendor: 'Acme Industrial Repair', category: 'Rush order' }, org)
    assert.deepEqual(result.history.changes, { category: ['Repair', 'Rush order'] })
  })

  test('editing a pending request without changing anything is refused', () => {
    throwsWorkflow(() => edit(alex, pendingRequest(alex, 50000), { vendor: 'Acme Industrial Repair' }, org), 'invalid', /nothing/i)
  })

  test('only the requester can edit', () => {
    throwsWorkflow(() => edit(morgan, pendingRequest(alex, 50000), { amountCents: 40000 }, org), 'forbidden')
  })

  test('resubmitting a sent-back request puts it back to Pending at step 1', () => {
    let request = pendingRequest(alex, 50000)
    request = applied(request, sendBack(morgan, request, org, 'Which machine?'))
    const result = edit(alex, request, { justification: 'Conveyor 3 motor failed' }, org, 'It is conveyor 3')
    assert.deepEqual(result.updates, { status: 'pending', currentStep: 1, justification: 'Conveyor 3 motor failed' })
    assert.equal(result.history.action, 'resubmitted')
    assert.equal(result.history.comment, 'It is conveyor 3')
  })

  test('approved, rejected and withdrawn requests are locked', () => {
    for (const status of ['approved', 'rejected', 'withdrawn']) {
      const request = { ...pendingRequest(alex, 50000), status, currentStep: null }
      throwsWorkflow(() => edit(alex, request, { amountCents: 40000 }, org), 'conflict')
      throwsWorkflow(() => approve(morgan, request, org), 'conflict')
    }
  })

  test('a sent-back request cannot be approved until it is resubmitted', () => {
    let request = pendingRequest(alex, 50000)
    request = applied(request, sendBack(morgan, request, org, 'Which machine?'))
    throwsWorkflow(() => approve(morgan, request, org), 'conflict')
  })
})

// ---------- Choosing a backup while away (US-13, F1, F2) ----------
describe('choosing a backup', () => {
  test('an approver can pick another approver as backup', () => {
    assert.doesNotThrow(() => checkDelegate(morgan, jordan))
    assert.doesNotThrow(() => checkDelegate(daniel, victoria))
  })

  test('an approver can clear their backup (null = "I am back")', () => {
    assert.doesNotThrow(() => checkDelegate(morgan, null))
  })

  test('employees and finance viewers cannot pick a backup (they approve nothing)', () => {
    throwsWorkflow(() => checkDelegate(alex, jordan), 'forbidden')
    throwsWorkflow(() => checkDelegate(dana, jordan), 'forbidden')
  })

  test('you cannot be your own backup', () => {
    throwsWorkflow(() => checkDelegate(morgan, morgan), 'invalid', /own backup/i)
  })

  test('the backup must be an approver, not an employee or finance viewer', () => {
    throwsWorkflow(() => checkDelegate(morgan, alex), 'invalid', /approver/i)
    throwsWorkflow(() => checkDelegate(morgan, dana), 'invalid', /approver/i)
  })

  test('an unknown backup person is refused', () => {
    throwsWorkflow(() => checkDelegate(morgan, undefined), 'invalid', /not found/i)
  })

  test('the backup can act on the full chain: reject and send back too, all marked "on behalf of"', () => {
    const away = { ...org, users: users.map((u) => (u.id === morgan.id ? { ...u, delegateId: jordan.id } : u)) }
    assert.equal(reject(jordan, pendingRequest(alex, 50000), away, 'No').history.onBehalfOfId, morgan.id)
    assert.equal(sendBack(jordan, pendingRequest(alex, 50000), away, 'More info').history.onBehalfOfId, morgan.id)
  })
})

// ---------- One person, one approval per round (separation of duties) ----------
// Found in the self-review: the backup rule and the route rule were each fine alone, but together
// they let one person approve two stages of the same request.
describe('one person approves at most one stage', () => {
  test('a later approver cannot also approve an earlier stage as someone’s backup', () => {
    // Alex $5,000 → Morgan → Daniel. Morgan is away and picked Daniel as backup.
    const request = pendingRequest(alex, 500000)
    throwsWorkflow(() => approve(daniel, request, away({ [morgan.id]: daniel.id })), 'forbidden', /another stage/i)
  })

  test('…but the same backup can approve when they are not on the route', () => {
    // Alex $500 → Morgan only, so Daniel covering for Morgan is fine.
    const result = approve(daniel, pendingRequest(alex, 50000), away({ [morgan.id]: daniel.id }))
    assert.equal(result.history.onBehalfOfId, morgan.id)
  })

  test('someone covering two approvers cannot approve both stages', () => {
    // Jordan is the backup for both Morgan and Daniel.
    const both = away({ [morgan.id]: jordan.id, [daniel.id]: jordan.id })
    let request = pendingRequest(alex, 500000)
    request = applied(request, approve(jordan, request, both)) // stage 1 for Morgan: fine
    throwsWorkflow(() => approve(jordan, request, both), 'forbidden', /already approved/i) // stage 2 for Daniel: no
  })

  test('an approver cannot approve a later stage as a backup after approving their own', () => {
    // Alex $5,000 → Morgan → Daniel. Morgan approves, then Daniel goes away and picks Morgan.
    let request = pendingRequest(alex, 500000)
    request = applied(request, approve(morgan, request, org))
    throwsWorkflow(() => approve(morgan, request, away({ [daniel.id]: morgan.id })), 'forbidden', /already approved/i)
  })

  test('after an edit, a new round starts, so earlier approvals no longer count', () => {
    let request = pendingRequest(alex, 50000)
    request = applied(request, sendBack(morgan, request, org, 'Quote?'))
    request = applied(request, edit(alex, request, { justification: 'Quote QS-114' }, org))
    assert.deepEqual(request.approvedThisRound, [])
    assert.equal(approve(morgan, request, org).updates.status, 'approved')
  })

  test('rejecting or sending back is still allowed (it needs no second person)', () => {
    const request = pendingRequest(alex, 500000)
    const covered = away({ [morgan.id]: daniel.id })
    assert.equal(sendBack(daniel, request, covered, 'Quote?').updates.status, 'sent_back')
    assert.equal(reject(daniel, request, covered, 'No').updates.status, 'rejected')
  })
})

// ---------- Withdraw (US-8) ----------
describe('withdraw', () => {
  test('the requester can withdraw a pending request', () => {
    const result = withdraw(alex, pendingRequest(alex, 50000))
    assert.deepEqual(result.updates, { status: 'withdrawn', currentStep: null })
    assert.equal(result.history.action, 'withdrawn')
  })

  test('nobody else can withdraw it', () => {
    throwsWorkflow(() => withdraw(morgan, pendingRequest(alex, 50000)), 'forbidden')
  })

  test('an approved request cannot be withdrawn', () => {
    throwsWorkflow(() => withdraw(alex, { ...pendingRequest(alex, 50000), status: 'approved' }), 'conflict')
  })
})
