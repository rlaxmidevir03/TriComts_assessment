// The HTTP layer. Each route: read the input → load data → ask workflow.js → save → reply.
// No approval rules here; those live in workflow.js.
import { Router } from 'express'
import * as workflow from './workflow.js'
import * as store from './store.js'

const SEE_EVERYTHING = ['finance', 'vp_finance'] // G2: Finance and the VP of Finance see all requests

export function requestRoutes(db) {
  const router = Router()

  router.get('/me', (req, res) => {
    res.json(withDelegateName(req.user))
  })

  // Vacation cover (Marcus, US-13): { delegateId: 5 } names a backup, { delegateId: null } clears it.
  router.put('/me/delegate', (req, res) => {
    const delegateId = req.body?.delegateId ?? null
    const delegate = delegateId === null ? null : store.getUser(db, Number(delegateId)) ?? undefined
    workflow.checkDelegate(req.user, delegate)
    store.setDelegate(db, req.user.id, delegate?.id ?? null)
    res.json(withDelegateName(store.getUser(db, req.user.id)))
  })

  function withDelegateName(user) {
    return { ...user, delegateName: user.delegateId ? store.getUser(db, user.delegateId).name : null }
  }

  router.get('/departments', (req, res) => {
    res.json(store.listDepartments(db))
  })

  // ?view=mine | inbox | reviewed | all   (+ q, status, departmentId for "all")
  router.get('/requests', (req, res) => {
    const view = req.query.view || 'mine'
    if (!['mine', 'inbox', 'reviewed', 'all'].includes(view)) return res.status(400).json({ error: 'Unknown view' })
    if (view === 'all' && !SEE_EVERYTHING.includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Finance can see all requests.' })
    }
    const { q, status } = req.query
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined
    res.json(store.listRequests(db, { view, user: req.user, q, status, departmentId }))
  })

  router.get('/requests/:id', (req, res) => {
    const request = loadVisibleRequest(req)
    res.json({ ...request, history: store.getHistory(db, request.id) })
  })

  router.post('/requests', (req, res) => {
    const result = workflow.submit(req.user, requestFields(req.body), store.loadOrg(db))
    const id = store.createRequest(db, req.user.id, result)
    res.status(201).json(store.getRequest(db, id))
  })

  router.put('/requests/:id', (req, res) => {
    act(req, res, (request, org) => workflow.edit(req.user, request, requestFields(req.body), org, req.body?.comment))
  })

  router.post('/requests/:id/approve', (req, res) => {
    act(req, res, (request, org) => workflow.approve(req.user, request, org, req.body?.comment))
  })

  router.post('/requests/:id/reject', (req, res) => {
    act(req, res, (request, org) => workflow.reject(req.user, request, org, req.body?.comment))
  })

  router.post('/requests/:id/send-back', (req, res) => {
    act(req, res, (request, org) => workflow.sendBack(req.user, request, org, req.body?.comment))
  })

  router.post('/requests/:id/withdraw', (req, res) => {
    act(req, res, (request) => workflow.withdraw(req.user, request))
  })

  // Shared by every action: load → check version → apply the rule → save (with its history row) → reply.
  function act(req, res, rule) {
    // Every change must say which version of the request the user was looking at, so nobody
    // approves (or edits) something that changed after they opened it.
    const request = loadRequest(req.params.id)
    const version = req.body?.version
    if (!Number.isInteger(version)) {
      throw new workflow.WorkflowError('invalid', 'Missing "version": the version of the request you are looking at.')
    }
    if (request.version !== version) throw new workflow.WorkflowError('conflict', store.STALE_MESSAGE)

    const result = rule(request, store.loadOrg(db))
    store.applyResult(db, request.id, result, version)
    res.json(store.getRequest(db, request.id))
  }

  function loadRequest(id) {
    const request = store.getRequest(db, Number(id))
    if (!request) throw new NotFound()
    return request
  }

  // Who can open a request: its requester, Finance/VP, anyone on its route or covering for them,
  // anyone who has acted on it before, and anyone a backup acted for.
  function loadVisibleRequest(req) {
    const request = loadRequest(req.params.id)
    const user = req.user
    const org = store.loadOrg(db)
    const onRoute = request.steps.some((s) => {
      const approver = org.users.find((u) => u.id === s.approverId)
      return approver.id === user.id || approver.delegateId === user.id
    })
    const canSee =
      request.requesterId === user.id ||
      SEE_EVERYTHING.includes(user.role) ||
      onRoute ||
      store.hasActedOn(db, user.id, request.id)
    if (!canSee) throw new workflow.WorkflowError('forbidden', 'You do not have access to this request.')
    return request
  }

  return router
}

// Only take the fields a requester may set; ignore anything else in the body.
function requestFields(body = {}) {
  const fields = {}
  for (const key of ['vendor', 'category', 'justification', 'amountCents']) {
    if (body[key] !== undefined) fields[key] = body[key]
  }
  return fields
}

export class NotFound extends Error {}

// Turns errors into JSON replies: WorkflowError kinds → 400 / 403 / 409, unknown request → 404.
const STATUS_FOR_KIND = { invalid: 400, forbidden: 403, conflict: 409 }

export function errorHandler(err, req, res, next) {
  if (err instanceof NotFound) return res.status(404).json({ error: 'Request not found' })
  if (err instanceof workflow.WorkflowError) return res.status(STATUS_FOR_KIND[err.kind]).json({ error: err.message })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
}
