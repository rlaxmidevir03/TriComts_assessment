import { useEffect, useState } from 'react'

// Placeholder screen for Step 1: proves the client can reach the server.
// Real screens (My Requests, Approvals, All Requests) come in later steps.
export default function App() {
  const [status, setStatus] = useState('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('server not reachable'))
  }, [])

  return (
    <main>
      <h1>Riverbend Supply – Purchase Exceptions</h1>
      <p>Server status: {status}</p>
    </main>
  )
}
