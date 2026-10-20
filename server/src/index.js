import { openDb } from './db.js'
import { createApp } from './app.js'

const PORT = process.env.PORT || 3001
const app = createApp(openDb())

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)
})
