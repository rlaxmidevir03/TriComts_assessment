import express from 'express'
import { authenticate } from './auth.js'
import { requestRoutes, errorHandler } from './routes.js'

// Builds the Express app without starting it, so tests can create
// their own app with an in-memory database.
export function createApp(db) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  // Demo only: the list of users for the "Viewing as" switcher.
  // Removed when Microsoft sign-in arrives.
  app.get('/api/users', (req, res) => {
    const users = db
      .prepare('SELECT u.id, u.name, u.role, d.name AS departmentName FROM users u JOIN departments d ON d.id = u.department_id ORDER BY u.id')
      .all()
    res.json(users)
  })

  // Everything below needs a signed-in user.
  app.use('/api', authenticate(db), requestRoutes(db))

  app.use(errorHandler)
  return app
}
