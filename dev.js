// `npm run dev` from the project root: starts the API and the website together.
// Ctrl+C stops both. (Plain Node, so no extra library is needed.)
import { spawn } from 'node:child_process'

const parts = [
  { name: 'server', color: 36 }, // cyan
  { name: 'client', color: 35 }, // magenta
]

const children = parts.map(({ name, color }) => {
  const child = spawn('npm', ['run', 'dev', '--prefix', name], { shell: true })
  const label = `\x1b[${color}m[${name}]\x1b[0m `
  const print = (data) => process.stdout.write(data.toString().replace(/^(?=.)/gm, label))
  child.stdout.on('data', print)
  child.stderr.on('data', print)
  return child
})

process.on('SIGINT', () => {
  children.forEach((child) => child.kill())
  process.exit()
})
