import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { ROLE_LABELS } from '../format.js'

const APPROVER_ROLES = ['manager', 'director', 'vp_finance']

// Marcus's vacation problem: an approver names a backup while they're away.
// While set, the backup sees this approver's waiting requests and can act on them;
// the history then reads "<backup> on behalf of <approver>".
export default function BackupPanel({ users, currentUser, onChanged }) {
  const [me, setMe] = useState(null)
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api('/me').then(setMe)
  }, [currentUser.id])

  // Only other approvers can be a backup (the server checks this too).
  const candidates = users.filter((u) => u.id !== currentUser.id && APPROVER_ROLES.includes(u.role))

  async function save(delegateId) {
    setError('')
    try {
      setMe(await api('/me/delegate', { method: 'PUT', body: { delegateId } }))
      setChoice('')
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!me) return null

  return (
    <div className={`card backup-panel ${me.delegateId ? 'away' : ''}`}>
      {me.delegateId ? (
        <>
          <p>
            <strong>You are marked as away.</strong> {me.delegateName} is approving on your behalf.
          </p>
          <button onClick={() => save(null)}>I’m back</button>
        </>
      ) : (
        <>
          <label htmlFor="backup">
            <strong>Going away?</strong> Pick a backup to approve for you:
          </label>
          <select id="backup" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose a person…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} – {ROLE_LABELS[u.role]}
              </option>
            ))}
          </select>
          <button className="primary" disabled={!choice} onClick={() => save(Number(choice))}>
            Set backup
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
