import { getUser } from './store.js'

// The ONLY place that decides who the current user is.
//
// Demo mode: the React app sends the chosen demo user's id in an
// "X-User-Id" header. Later, Microsoft sign-in (Entra ID) replaces just this
// function: validate the token, look the user up by email, set req.user.
// Routes and approval rules only ever read req.user, so nothing else has to change.
export function authenticate(db) {
  return (req, res, next) => {
    const user = getUser(db, Number(req.get('X-User-Id')))
    if (!user) return res.status(401).json({ error: 'Not signed in' })
    req.user = user
    next()
  }
}
