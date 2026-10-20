import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { STATUS_LABELS } from '../format.js'
import RequestTable from './RequestTable.jsx'

export const NO_FILTERS = { q: '', status: '', departmentId: '' }

// Dana's view (US-12): every request in the company, searchable and filterable.
// The server decides who may see this (Finance and the VP of Finance only).
// The filters are kept by App, so they're still set after opening a request and coming back.
export default function AllRequests({ onOpen, filters, setFilters }) {
  const { q, status, departmentId } = filters
  const setQ = (value) => setFilters({ ...filters, q: value })
  const setStatus = (value) => setFilters({ ...filters, status: value })
  const setDepartmentId = (value) => setFilters({ ...filters, departmentId: value })
  const [departments, setDepartments] = useState([])
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/departments').then(setDepartments)
  }, [])

  // Reload whenever a filter changes. The short delay means we search once the user
  // pauses typing, instead of on every keystroke.
  useEffect(() => {
    const params = new URLSearchParams({ view: 'all' })
    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (departmentId) params.set('departmentId', departmentId)

    const timer = setTimeout(() => {
      api(`/requests?${params}`)
        .then(setRequests)
        .catch((err) => setError(err.message))
    }, 250)
    return () => clearTimeout(timer)
  }, [q, status, departmentId])

  const hasFilters = q || status || departmentId
  const clearFilters = () => setFilters(NO_FILTERS)

  if (error) return <p className="error">{error}</p>

  return (
    <section>
      <div className="filters">
        <label>
          Search
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Vendor, requester or reason"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Department
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {hasFilters && (
          <button type="button" className="link-button clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {requests && (
        <>
          <p className="result-count">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'}
          </p>
          <RequestTable
            requests={requests}
            onOpen={onOpen}
            showRequester
            showDepartment
            showDaysWaiting
            emptyText="No requests match these filters."
          />
        </>
      )}
    </section>
  )
}
