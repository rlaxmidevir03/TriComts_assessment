// `npm run reset-db`: delete the local database and start again from the demo data.
import { rmSync } from 'node:fs'
import { openDb } from './db.js'
import { seed, seedSampleRequests } from './seed.js'

const file = process.env.DB_FILE || 'data/app.db'
rmSync(file, { force: true })
const db = openDb(file)
seed(db)
seedSampleRequests(db)
console.log(`Fresh database created at ${file}`)
