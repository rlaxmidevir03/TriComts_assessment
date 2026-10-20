// Display helpers shared by the screens.

// Amounts travel as whole cents (125050) and show as dollars ($1,250.50).
export function money(cents) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// "1250.5" typed in the form -> 125050 cents. Rounding avoids 0.1 + 0.2 style float errors.
export function toCents(dollarsText) {
  return Math.round(Number(dollarsText) * 100)
}

export function dateTime(iso) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export const STATUS_LABELS = {
  pending: 'Pending',
  sent_back: 'Sent back',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const ROLE_LABELS = {
  employee: 'Employee',
  manager: 'Manager',
  director: 'Director',
  vp_finance: 'VP of Finance',
  finance: 'Finance (view only)',
}

export const ACTION_LABELS = {
  submitted: 'Submitted',
  edited: 'Edited',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
  rejected: 'Rejected',
  sent_back: 'Sent back',
  withdrawn: 'Withdrawn',
}

// Who the request is waiting on right now, in words.
export function waitingOn(request) {
  if (request.status === 'sent_back') return `${request.requesterName} (requester)`
  if (request.status !== 'pending') return '—'
  if (request.coveringDelegateName) return `${request.coveringDelegateName} (covering for ${request.currentApproverName})`
  return request.currentApproverName
}

export const requestNumber = (id) => `PE-${String(id).padStart(4, '0')}`
