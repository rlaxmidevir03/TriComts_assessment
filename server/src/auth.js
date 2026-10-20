// The ONLY place that decides who the current user is.
//
// Demo mode: the React app sends the chosen demo user's id in an
// "X-User-Id" header. Later, Microsoft sign-in (Entra ID) replaces just this
// function: validate the token, look up the user, set req.user. Routes and
// approval rules only ever read req.user, so nothing else has to change.
export function authenticate(req, res, next) {
  const userId = Number(req.get('X-User-Id'))
  if (!userId) return res.status(401).json({ error: 'Not signed in' })
  req.user = { id: userId } // Step 4 will load the full user (name, role) from the database.
  next()
}
