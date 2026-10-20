import { openDb } from './db.js'
import { seed, seedSampleRequests, isEmpty } from './seed.js'
import { createApp } from './app.js'

const PORT = process.env.PORT || 3001
const db = openDb()

// First run: fill the empty database with demo data so the app works straight away.
if (isEmpty(db)) {
  seed(db)
  seedSampleRequests(db)
  console.log('Seeded demo users and sample requests')
}

// Express 5 calls this callback on failure too, so check for an error before saying we're running.
createApp(db).listen(PORT, (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is the server already running in another terminal?`)
    process.exit(1)
  }
  if (err) throw err
  console.log(`API running on http://localhost:${PORT}`)
})
