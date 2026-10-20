// `npm run reset-db`: delete the local database and start again from the demo data.
import { rmSync } from 'node:fs'
import { openDb } from './db.js'
import { seed, seedSampleRequests } from './seed.js'

const file = process.env.DB_FILE || 'data/app.db'
try {
  rmSync(file, { force: true })
} catch (err) {
  // On Windows a running server keeps the file locked.
  if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err
  console.error('The database is in use. Stop the server (Ctrl+C), run this again, then restart the server.')
  process.exit(1)
}
const db = openDb(file)
seed(db)
seedSampleRequests(db)
console.log(`Fresh database created at ${file}`)
