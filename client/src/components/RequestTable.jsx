import { money, requestNumber, waitingOn, STATUS_LABELS } from '../format.js'

// A table of requests. Used by "My requests" and "Awaiting my approval" (and later "All requests").
export default function RequestTable({ requests, onOpen, emptyText, showRequester = false }) {
  if (requests.length === 0) return <p className="empty">{emptyText}</p>

  return (
    <table className="request-table">
      <thead>
        <tr>
          <th>Request</th>
          {showRequester && <th>Requester</th>}
          <th>Vendor</th>
          <th className="num">Amount</th>
          <th>Status</th>
          <th>Waiting on</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => (
          <tr key={r.id} onClick={() => onOpen(r.id)} className="clickable">
            <td className="link">{requestNumber(r.id)}</td>
            {showRequester && <td>{r.requesterName}</td>}
            <td>{r.vendor}</td>
            <td className="num">{money(r.amountCents)}</td>
            <td>
              <span className={`badge badge-${r.status}`}>{STATUS_LABELS[r.status]}</span>
            </td>
            <td>{waitingOn(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
