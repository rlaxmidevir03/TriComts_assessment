// The approval rules, as plain functions.
//
// No Express and no SQL here: each function takes plain objects (the user acting,
// the request, the org chart) and either throws a WorkflowError or returns what
// should change:
//   { updates: fields to save on the request,
//     steps:   the new approval route (only when it's rebuilt),
//     history: the one audit entry to append }
// The API layer saves all three in one transaction.
// Requirement IDs (A1, US-7, ...) refer to docs/requirements.md.

// Amounts are whole cents. Change approval limits here (A1, A2).
export const THRESHOLDS = {
  director: 100000, // $1,000.00 and above also needs the department director
  vp: 1000000, // $10,000.00 and above also needs the VP of Finance
}

export const CATEGORIES = ['Rush order', 'Repair', 'New vendor', 'Other']

// Roles that can appear on an approval route.
export const APPROVER_ROLES = ['manager', 'director', 'vp_finance']

const EDITABLE_FIELDS = ['vendor', 'category', 'justification', 'amountCents']

// kind is 'invalid' (bad input), 'forbidden' (not your call) or 'conflict' (wrong status).
// The API layer turns these into HTTP 400 / 403 / 409.
export class WorkflowError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

// ---------- Routing ----------

// Which approval levels an amount needs, in order.
export function levelsFor(amountCents) {
  if (amountCents >= THRESHOLDS.vp) return ['manager', 'director', 'vp']
  if (amountCents >= THRESHOLDS.director) return ['manager', 'director']
  return ['manager']
}

// Builds the ordered list of approvers for a request (A3, A4, B1–B4).
export function buildRoute(requester, amountCents, org) {
  const steps = []

  for (const level of levelsFor(amountCents)) {
    let person = findLevelApprover(level, requester, org)

    // Never approve your own request: hand it to your own manager instead (B1, B3).
    while (person && person.id === requester.id) person = findUser(org, person.managerId)

    if (!person) {
      throw new WorkflowError('invalid', `No eligible approver for the ${level} stage. Please contact Finance.`) // B4
    }

    // Same person twice (e.g. your manager is also the director): one approval covers both,
    // recorded at the higher level (B2).
    const existing = steps.find((s) => s.approverId === person.id)
    if (existing) existing.level = level
    else steps.push({ stepNo: steps.length + 1, level, approverId: person.id })
  }

  return steps
}

function findLevelApprover(level, requester, org) {
  if (level === 'manager') return findUser(org, requester.managerId)
  if (level === 'director') {
    const department = org.departments.find((d) => d.id === requester.departmentId)
    return findUser(org, department?.directorId)
  }
  return org.users.find((u) => u.role === 'vp_finance')
}

function findUser(org, id) {
  return org.users.find((u) => u.id === id)
}

// ---------- Requester actions ----------

// US-1: submit a new request.
export function submit(user, fields, org) {
  if (user.role === 'finance') throw new WorkflowError('forbidden', 'Finance viewers cannot submit requests.')
  const clean = validateFields(fields)
  return {
    updates: { ...clean, status: 'pending', currentStep: 1 },
    steps: buildRoute(user, clean.amountCents, org),
    history: entry('submitted', user),
  }
}

// US-7 / US-5: change a request. Any edit restarts approval at step 1 with a fresh route,
// so an approval given for $900 can never carry over to $9,000 (C3, D2).
export function edit(user, request, changes, org, comment) {
  requireRequester(user, request, 'edit')
  if (!['pending', 'sent_back'].includes(request.status)) {
    throw new WorkflowError('conflict', `A request that is ${request.status} can no longer be edited.`) // D4
  }

  const merged = validateFields({ ...pick(request, EDITABLE_FIELDS), ...pick(changes, EDITABLE_FIELDS) })
  const changed = {} // old -> new, for the audit trail (E2)
  for (const field of EDITABLE_FIELDS) {
    if (merged[field] !== request[field]) changed[field] = [request[field], merged[field]]
  }

  const isResubmit = request.status === 'sent_back'
  if (!isResubmit && Object.keys(changed).length === 0) {
    throw new WorkflowError('invalid', 'Nothing was changed.')
  }

  const newValues = Object.fromEntries(Object.entries(changed).map(([field, [, now]]) => [field, now]))
  return {
    updates: { status: 'pending', currentStep: 1, ...newValues },
    steps: buildRoute(user, merged.amountCents, org),
    history: entry(isResubmit ? 'resubmitted' : 'edited', user, {
      comment,
      changes: Object.keys(changed).length ? changed : null,
    }),
  }
}

// US-8: the requester cancels a request that's still open.
export function withdraw(user, request) {
  requireRequester(user, request, 'withdraw')
  if (!['pending', 'sent_back'].includes(request.status)) {
    throw new WorkflowError('conflict', `A request that is ${request.status} can no longer be withdrawn.`)
  }
  return { updates: { status: 'withdrawn', currentStep: null }, history: entry('withdrawn', user) }
}

// ---------- Approver actions ----------

// US-3: approve the current step. The last approval makes the whole request Approved.
export function approve(user, request, org, comment) {
  const onBehalfOfId = checkCanAct(user, request, org)
  const isLastStep = request.currentStep >= request.steps.length
  return {
    updates: isLastStep
      ? { status: 'approved', currentStep: null }
      : { status: 'pending', currentStep: request.currentStep + 1 },
    history: entry('approved', user, { onBehalfOfId, comment }),
  }
}

// US-4: reject. Final, and the requester must be told why.
export function reject(user, request, org, comment) {
  const onBehalfOfId = checkCanAct(user, request, org)
  if (isBlank(comment)) throw new WorkflowError('invalid', 'A reason is required to reject a request.')
  return {
    updates: { status: 'rejected', currentStep: null },
    history: entry('rejected', user, { onBehalfOfId, comment }),
  }
}

// US-5: send back to the requester for more information.
export function sendBack(user, request, org, comment) {
  const onBehalfOfId = checkCanAct(user, request, org)
  if (isBlank(comment)) throw new WorkflowError('invalid', 'A comment is required to send a request back.')
  return {
    updates: { status: 'sent_back', currentStep: null },
    history: entry('sent_back', user, { onBehalfOfId, comment }),
  }
}

// Who may approve / reject / send back right now (US-6, US-13).
// Returns the id of the person being covered for, or null if acting for themselves.
export function checkCanAct(user, request, org) {
  if (request.status !== 'pending') {
    throw new WorkflowError('conflict', `This request is ${request.status}, so it can't be acted on.`)
  }
  if (user.role === 'finance') {
    throw new WorkflowError('forbidden', 'Finance viewers can see requests but cannot approve, reject or send back.')
  }
  if (user.id === request.requesterId) {
    throw new WorkflowError('forbidden', 'You cannot act on your own request.')
  }

  const step = request.steps.find((s) => s.stepNo === request.currentStep)
  const approver = findUser(org, step?.approverId)
  if (approver?.id === user.id) return null
  if (approver?.delegateId === user.id) return approver.id // covering while they're away
  throw new WorkflowError('forbidden', 'This request is not waiting on you.')
}

// ---------- Vacation cover (Marcus, US-13) ----------

// Can `user` name `delegate` as their backup while away? Pass null to clear it ("I'm back"),
// or undefined if the chosen person doesn't exist.
// The backup then acts on the user's waiting requests (see checkCanAct), and history
// records "<backup> on behalf of <user>".
export function checkDelegate(user, delegate) {
  if (!APPROVER_ROLES.includes(user.role)) {
    throw new WorkflowError('forbidden', 'Only approvers can name a backup.')
  }
  if (delegate === null) return
  if (!delegate) throw new WorkflowError('invalid', 'Backup person not found.')
  if (delegate.id === user.id) throw new WorkflowError('invalid', 'You cannot be your own backup.')
  if (!APPROVER_ROLES.includes(delegate.role)) {
    throw new WorkflowError('invalid', 'Your backup must be another approver (manager, director or VP).')
  }
}

// ---------- Helpers ----------

function requireRequester(user, request, verb) {
  if (user.id !== request.requesterId) {
    throw new WorkflowError('forbidden', `Only the person who submitted a request can ${verb} it.`)
  }
}

// Checks the request fields and returns trimmed copies (US-1).
export function validateFields(fields) {
  const vendor = String(fields.vendor ?? '').trim()
  const justification = String(fields.justification ?? '').trim()
  const { category, amountCents } = fields

  if (!vendor) throw new WorkflowError('invalid', 'Vendor is required.')
  if (!justification) throw new WorkflowError('invalid', 'A reason (justification) is required.')
  if (!CATEGORIES.includes(category)) {
    throw new WorkflowError('invalid', `Category must be one of: ${CATEGORIES.join(', ')}.`)
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new WorkflowError('invalid', 'Amount must be greater than $0 (in whole cents).')
  }
  return { vendor, category, justification, amountCents }
}

// Builds one history entry. Every action produces exactly one.
function entry(action, user, { onBehalfOfId = null, comment = null, changes = null } = {}) {
  return { action, actorId: user.id, onBehalfOfId, comment: isBlank(comment) ? null : comment.trim(), changes }
}

function isBlank(text) {
  return typeof text !== 'string' || text.trim() === ''
}

function pick(object, keys) {
  return Object.fromEntries(keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]]))
}
