import { useEffect, useState } from 'react'
import { api, setCurrentUser } from './api.js'
import UserSwitcher from './components/UserSwitcher.jsx'
import RequestTable from './components/RequestTable.jsx'
import RequestForm from './components/RequestForm.jsx'
import RequestDetail from './components/RequestDetail.jsx'

const APPROVER_ROLES = ['manager', 'director', 'vp_finance']

// Remember the chosen demo user between page reloads (a convenience only).
function savedUserId() {
  try {
    return Number(localStorage.getItem('demoUserId')) || null
  } catch {
    return null
  }
}

export default function App() {
  const [users, setUsers] = useState([])
  const [currentUser, setUser] = useState(null)
  // Which screen is showing. Kept as simple state instead of adding a router library.
  // { name: 'mine' | 'inbox' | 'detail' | 'form', id?, request? }
  const [page, setPage] = useState({ name: 'mine' })

  useEffect(() => {
    api('/users').then((list) => {
      setUsers(list)
      switchUser(savedUserId() ?? list.find((u) => u.role === 'employee').id, list)
    })
  }, [])

  function switchUser(id, list = users) {
    setCurrentUser(id)
    try {
      localStorage.setItem('demoUserId', String(id))
    } catch {
      // storage blocked: the app still works, it just won't remember the choice
    }
    const user = list.find((u) => u.id === id)
    setUser(user)
    setPage({ name: APPROVER_ROLES.includes(user.role) ? 'inbox' : 'mine' })
  }

  if (!currentUser) return <main>Loading…</main>

  const isApprover = APPROVER_ROLES.includes(currentUser.role)
  const canSubmit = currentUser.role !== 'finance'
  const open = (id) => setPage({ name: 'detail', id })

  return (
    <>
      <header className="top-bar">
        <h1>Purchase Exceptions</h1>
        <UserSwitcher users={users} currentUser={currentUser} onChange={switchUser} />
      </header>

      <main>
        <nav className="tabs">
          <Tab page={page} name="mine" setPage={setPage}>
            My requests
          </Tab>
          {isApprover && (
            <Tab page={page} name="inbox" setPage={setPage}>
              Awaiting my approval
            </Tab>
          )}
          {canSubmit && (
            <button className="primary new-button" onClick={() => setPage({ name: 'form' })}>
              + New request
            </button>
          )}
        </nav>

        {page.name === 'mine' && (
          <ListPage
            key={`mine-${currentUser.id}`}
            view="mine"
            onOpen={open}
            emptyText={canSubmit ? 'You have no requests yet. Use “New request” to create one.' : 'Finance viewers do not submit requests.'}
          />
        )}
        {page.name === 'inbox' && (
          <ListPage key={`inbox-${currentUser.id}`} view="inbox" onOpen={open} showRequester emptyText="Nothing is waiting on you." />
        )}
        {page.name === 'detail' && (
          <RequestDetail
            id={page.id}
            currentUser={currentUser}
            onEdit={(request) => setPage({ name: 'form', request })}
            onBack={() => setPage({ name: isApprover ? 'inbox' : 'mine' })}
          />
        )}
        {page.name === 'form' && (
          <RequestForm
            existing={page.request}
            onSaved={open}
            onCancel={() => (page.request ? open(page.request.id) : setPage({ name: 'mine' }))}
          />
        )}
      </main>
    </>
  )
}

function Tab({ page, name, setPage, children }) {
  return (
    <button className={`tab ${page.name === name ? 'active' : ''}`} onClick={() => setPage({ name })}>
      {children}
    </button>
  )
}

// Loads one of the server's list views and shows it as a table.
function ListPage({ view, onOpen, emptyText, showRequester }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/requests?view=${view}`)
      .then(setRequests)
      .catch((err) => setError(err.message))
  }, [view])

  if (error) return <p className="error">{error}</p>
  if (!requests) return <p>Loading…</p>
  return <RequestTable requests={requests} onOpen={onOpen} emptyText={emptyText} showRequester={showRequester} />
}
