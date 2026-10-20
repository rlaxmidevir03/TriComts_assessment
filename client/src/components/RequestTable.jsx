import { money, requestNumber, waitingOn, STATUS_LABELS } from '../format.js'

// A table of requests. Used by "My requests", "Awaiting my approval" and "All requests".
// The optional columns are switched on by the page that uses it.
export default function RequestTable({
  requests,
  onOpen,
  emptyText,
  showRequester = false,
  showDepartment = false,
  showDaysWaiting = false,
}) {
  if (requests.length === 0) return <p className="empty">{emptyText}</p>

  return (
    <table className="request-table">
      <thead>
        <tr>
          <th>Request</th>
          {showRequester && <th>Requester</th>}
          {showDepartment && <th>Department</th>}
          <th>Vendor</th>
          <th className="num">Amount</th>
          <th>Status</th>
          <th>Waiting on</th>
          {showDaysWaiting && <th className="num">Days waiting</th>}
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => (
          <tr key={r.id} onClick={() => onOpen(r.id)} className="clickable">
            <td className="link">{requestNumber(r.id)}</td>
            {showRequester && <td>{r.requesterName}</td>}
            {showDepartment && <td>{r.departmentName}</td>}
            <td>{r.vendor}</td>
            <td className="num">{money(r.amountCents)}</td>
            <td>
              <span className={`badge badge-${r.status}`}>{STATUS_LABELS[r.status]}</span>
            </td>
            <td>{waitingOn(r)}</td>
            {showDaysWaiting && <td className="num">{r.status === 'pending' ? r.daysWaiting : '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
