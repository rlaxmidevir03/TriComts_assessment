import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { money, dateTime, requestNumber, waitingOn, STATUS_LABELS, ACTION_LABELS } from '../format.js'

const OPEN = ['pending', 'sent_back']

// One request: its details, approval route, full history, and the buttons this user may use.
// Buttons are only a convenience: the server re-checks every rule.
export default function RequestDetail({ id, currentUser, onEdit, onBack }) {
  const [request, setRequest] = useState(null)
  const [error, setError] = useState('')

  function load() {
    api(`/requests/${id}`)
      .then(setRequest)
      .catch((err) => setError(err.message))
  }
  useEffect(load, [id, currentUser.id])

  if (error) return <Page onBack={onBack}><p className="error">{error}</p></Page>
  if (!request) return <Page onBack={onBack}><p>Loading…</p></Page>

  const isRequester = request.requesterId === currentUser.id
  const canEdit = isRequester && OPEN.includes(request.status)
  const canAct =
    request.status === 'pending' &&
    !isRequester &&
    currentUser.role !== 'finance' &&
    (request.currentApproverId === currentUser.id || request.coveringDelegateId === currentUser.id)

  return (
    <Page onBack={onBack}>
      <div className="card">
        <div className="detail-header">
          <h2>
            {requestNumber(request.id)} · {request.vendor}
          </h2>
          <span className={`badge badge-${request.status}`}>{STATUS_LABELS[request.status]}</span>
        </div>

        <dl className="facts">
          <dt>Amount</dt>
          <dd>{money(request.amountCents)}</dd>
          <dt>Category</dt>
          <dd>{request.category}</dd>
          <dt>Requester</dt>
          <dd>
            {request.requesterName}, {request.departmentName}
          </dd>
          <dt>Waiting on</dt>
          <dd>
            {waitingOn(request)}
            {request.daysWaiting > 0 && ` · ${request.daysWaiting} day(s)`}
          </dd>
          <dt>Reason</dt>
          <dd className="pre">{request.justification}</dd>
        </dl>

        {canEdit && (
          <div className="actions">
            <button className="primary" onClick={() => onEdit(request)}>
              {request.status === 'sent_back' ? 'Update and resubmit' : 'Edit'}
            </button>
            <WithdrawButton request={request} onDone={load} />
          </div>
        )}
      </div>

      {canAct && <ApproverPanel request={request} onDone={load} />}

      <Route request={request} />
      <History entries={request.history} />
    </Page>
  )
}

function Page({ onBack, children }) {
  return (
    <section>
      <button className="link-button" onClick={onBack}>
        ← Back
      </button>
      {children}
    </section>
  )
}

// Approve / Reject / Send back. A comment is required to reject or send back.
function ApproverPanel({ request, onDone }) {
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function act(action) {
    setError('')
    setBusy(true)
    try {
      await api(`/requests/${request.id}/${action}`, { method: 'POST', body: { comment, version: request.version } })
      onDone()
    } catch (err) {
      setError(err.message)
      // Someone changed it meanwhile: show the latest version so the approver decides on what's really there.
      if (err.status === 409) {
        setError('This request was changed since you opened it. The latest version is now shown – please review it again.')
        onDone()
      }
    }
    setBusy(false)
  }

  return (
    <div className="card approver-panel">
      <h3>Your decision</h3>
      {request.coveringDelegateName && (
        <p className="notice">You are covering for {request.currentApproverName} while they are away.</p>
      )}
      <label>
        <span>
          Comment <span className="hint">(required to reject or send back)</span>
        </span>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => act('approve')}>
          Approve
        </button>
        <button disabled={busy} onClick={() => act('send-back')}>
          Send back
        </button>
        <button className="danger" disabled={busy} onClick={() => act('reject')}>
          Reject
        </button>
      </div>
    </div>
  )
}

function WithdrawButton({ request, onDone }) {
  async function withdraw() {
    if (!window.confirm('Withdraw this request? This cannot be undone.')) return
    try {
      await api(`/requests/${request.id}/withdraw`, { method: 'POST', body: { version: request.version } })
      onDone()
    } catch (err) {
      window.alert(err.message)
      if (err.status === 409) onDone()
    }
  }
  return (
    <button className="danger" onClick={withdraw}>
      Withdraw
    </button>
  )
}

// The approval route for the current round: who signs, in what order, and how far it got.
function Route({ request }) {
  if (request.steps.length === 0) return null
  const stepState = (step) => {
    if (request.status === 'approved') return 'done'
    if (request.status !== 'pending') return 'idle'
    if (step.stepNo < request.currentStep) return 'done'
    return step.stepNo === request.currentStep ? 'current' : 'idle'
  }
  const LEVELS = { manager: 'Manager', director: 'Director', vp: 'VP of Finance' }

  return (
    <div className="card">
      <h3>Approval route</h3>
      <ol className="route">
        {request.steps.map((s) => (
          <li key={s.stepNo} className={`route-step ${stepState(s)}`}>
            <span className="route-level">{LEVELS[s.level]}</span>
            {s.approverName}
          </li>
        ))}
      </ol>
    </div>
  )
}

// The audit trail, oldest first. Read-only: the database refuses to change these rows.
function History({ entries }) {
  return (
    <div className="card">
      <h3>History</h3>
      <ol className="history">
        {entries.map((h) => (
          <li key={h.id}>
            <div>
              <strong>{ACTION_LABELS[h.action]}</strong> by {h.actorName}
              {h.onBehalfOfName && <> on behalf of {h.onBehalfOfName}</>}
              <span className="when">{dateTime(h.createdAt)}</span>
            </div>
            {h.comment && <blockquote>{h.comment}</blockquote>}
            {h.changes && <Changes changes={h.changes} />}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Changes({ changes }) {
  const NAMES = { vendor: 'Vendor', category: 'Category', justification: 'Reason', amountCents: 'Amount' }
  const show = (field, value) => (field === 'amountCents' ? money(value) : value)
  return (
    <ul className="changes">
      {Object.entries(changes).map(([field, [before, after]]) => (
        <li key={field}>
          {NAMES[field]}: <del>{show(field, before)}</del> → <ins>{show(field, after)}</ins>
        </li>
      ))}
    </ul>
  )
}
