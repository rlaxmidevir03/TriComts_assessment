import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'

// Starts the app on a random free port, calls it with fetch, then shuts down.
test('GET /api/health returns ok', async () => {
  const server = createApp(openDb(':memory:')).listen(0)
  const { port } = server.address()
  try {
    const res = await fetch(`http://localhost:${port}/api/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok' })
  } finally {
    server.close()
  }
})
