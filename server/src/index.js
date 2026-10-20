import { openDb } from './db.js'
import { seed, isEmpty } from './seed.js'
import { createApp } from './app.js'

const PORT = process.env.PORT || 3001
const db = openDb()

// First run: fill the empty database with demo users so the app works straight away.
if (isEmpty(db)) {
  seed(db)
  console.log('Seeded demo users')
}

createApp(db).listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)
})
