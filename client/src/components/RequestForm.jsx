import { useState } from 'react'
import { api } from '../api.js'
import { toCents } from '../format.js'

const CATEGORIES = ['Rush order', 'Repair', 'New vendor', 'Other']

// One form for both "New request" and "Edit request".
// `existing` is the request being edited, or undefined for a new one.
export default function RequestForm({ existing, onSaved, onCancel }) {
  const isEdit = Boolean(existing)
  const isResubmit = existing?.status === 'sent_back'

  const [vendor, setVendor] = useState(existing?.vendor ?? '')
  const [category, setCategory] = useState(existing?.category ?? CATEGORIES[0])
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2) : '')
  const [justification, setJustification] = useState(existing?.justification ?? '')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const fields = { vendor, category, justification, amountCents: toCents(amount) }
    try {
      // The server checks everything again; these errors come back as readable messages.
      const saved = isEdit
        ? await api(`/requests/${existing.id}`, { method: 'PUT', body: { ...fields, comment, version: existing.version } })
        : await api('/requests', { method: 'POST', body: fields })
      onSaved(saved.id)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>{isResubmit ? 'Update and resubmit' : isEdit ? 'Edit request' : 'New purchase exception'}</h2>

      {isEdit && (
        <p className="notice">
          Saving changes sends the request back to the <strong>first approver</strong>, so every approval
          is for the version they actually saw.
        </p>
      )}

      <label>
        Vendor
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} required maxLength={200} />
      </label>

      <div className="row">
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Amount (USD)
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
      </div>

      <label>
        Why is this needed?
        <textarea rows={4} value={justification} onChange={(e) => setJustification(e.target.value)} required />
      </label>

      {isEdit && (
        <label>
          Note for approvers (optional)
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Added the quote number" />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="submit" className="primary" disabled={saving}>
          {isResubmit ? 'Resubmit' : isEdit ? 'Save changes' : 'Submit request'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
