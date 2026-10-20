// Every call to the server goes through here.
// Demo sign-in: we send the chosen user's id in the X-User-Id header.
// With Microsoft sign-in this would send a token instead; nothing else in the UI changes.

let currentUserId = null

export function setCurrentUser(id) {
  currentUserId = id
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (currentUserId) headers['X-User-Id'] = String(currentUserId)

  const res = await fetch(`/api${path}`, { method, headers, body: body && JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  // The server explains every refusal (400/403/409) in data.error; show that to the user.
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.status = res.status // 409 = the request changed since it was loaded
    throw err
  }
  return data
}
