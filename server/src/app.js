import express from 'express'

// Builds the Express app without starting it, so tests can create
// their own app with an in-memory database.
export function createApp(db) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  return app
}
