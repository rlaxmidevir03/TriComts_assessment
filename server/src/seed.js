import { transaction } from './db.js'
import { loadOrg, getRequest, createRequest, applyResult } from './store.js'
import { submit, approve, reject, sendBack } from './workflow.js'

// Demo users and departments. All names are made up (synthetic data only).
//
// Org chart:
//   Elena Marsh (CFO) – approves the VP's own requests; top of the org
//   └── Victoria Hale (VP of Finance)
//       ├── Dana Whitfield (Finance – view only)
//       └── Daniel Ortiz (Director of Operations and Warehouse)
//           ├── Morgan Lee (Manager, Operations) ── Alex Chen (Employee)
//           └── Jordan Blake (Manager, Warehouse) ── Taylor Brooks (Employee)

const DEPARTMENTS = [
  { id: 1, name: 'Operations' },
  { id: 2, name: 'Warehouse' },
  { id: 3, name: 'Finance' },
]

// Listed top-down so every manager is inserted before the people who report to them.
// (Elena was added last, after the others had their ids, so she is id 8 but listed first.)
const USERS = [
  { id: 8, name: 'Elena Marsh', role: 'cfo', departmentId: 3, managerId: null },
  { id: 1, name: 'Victoria Hale', role: 'vp_finance', departmentId: 3, managerId: 8 },
  { id: 2, name: 'Dana Whitfield', role: 'finance', departmentId: 3, managerId: 1 },
  { id: 3, name: 'Daniel Ortiz', role: 'director', departmentId: 1, managerId: 1 },
  { id: 4, name: 'Morgan Lee', role: 'manager', departmentId: 1, managerId: 3 },
  { id: 5, name: 'Jordan Blake', role: 'manager', departmentId: 2, managerId: 3 },
  { id: 6, name: 'Alex Chen', role: 'employee', departmentId: 1, managerId: 4 },
  { id: 7, name: 'Taylor Brooks', role: 'employee', departmentId: 2, managerId: 5 },
]

// Which user directs each department (stage 2 approver).
const DIRECTORS = { 1: 3, 2: 3, 3: 1 }

// "Alex Chen" -> "alex.chen@riverbend.example" (.example is reserved, so never a real address)
function emailFor(name) {
  return `${name.toLowerCase().replace(' ', '.')}@riverbend.example`
}

export function seed(db) {
  transaction(db, () => {
    // Departments and users point at each other, so departments go in first
    // without a director, then the director is filled in once users exist.
    const addDept = db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)')
    for (const d of DEPARTMENTS) addDept.run(d.id, d.name)

    const addUser = db.prepare(
      'INSERT INTO users (id, name, email, role, department_id, manager_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const u of USERS) addUser.run(u.id, u.name, emailFor(u.name), u.role, u.departmentId, u.managerId)

    const setDirector = db.prepare('UPDATE departments SET director_id = ? WHERE id = ?')
    for (const [deptId, directorId] of Object.entries(DIRECTORS)) setDirector.run(directorId, Number(deptId))
  })
}

// Sample requests in different states, so every screen has something to show.
// They're created through the real workflow rules, so their history is genuine.
export function seedSampleRequests(db) {
  const org = loadOrg(db)
  const user = (id) => org.users.find((u) => u.id === id)
  const [daniel, morgan, jordan, alex, taylor] = [3, 4, 5, 6, 7].map(user)

  const newRequest = (requester, vendor, category, amountCents, justification) =>
    createRequest(db, requester.id, submit(requester, { vendor, category, amountCents, justification }, org))
  const then = (id, rule) => {
    const request = getRequest(db, id)
    applyResult(db, id, rule(request), request.version)
  }

  // 1. Small rush order, waiting on the manager.
  newRequest(alex, 'QuickShip Logistics', 'Rush order', 45000, 'Overnight freight for a customer order that missed the weekly truck.')

  // 2. Mid-size repair: manager approved, now waiting on the director.
  const repair = newRequest(alex, 'Acme Industrial Repair', 'Repair', 480000, 'Conveyor 3 drive motor failed; line is down until it is replaced.')
  then(repair, (r) => approve(morgan, r, org, 'Confirmed with the shift lead.'))

  // 3. Dana's $14,000 story: manager and director approved, waiting on the VP of Finance.
  const forklift = newRequest(taylor, 'Northwind Forklift Services', 'New vendor', 1400000, 'Emergency forklift rental while our two units are out for inspection.')
  then(forklift, (r) => approve(jordan, r, org))
  then(forklift, (r) => approve(daniel, r, org, 'No contracted vendor had units available this week.'))

  // 4. Sent back for more information.
  const safety = newRequest(taylor, 'Brightline Safety Supply', 'Other', 230000, 'Replacement safety harnesses for the mezzanine team.')
  then(safety, (r) => sendBack(jordan, r, org, 'Please add the quote number and how many harnesses.'))

  // 5. Fully approved.
  const hvac = newRequest(alex, 'Metro HVAC Co.', 'Repair', 78000, 'Office AC compressor repair before the heat wave.')
  then(hvac, (r) => approve(morgan, r, org))

  // 6. Rejected with a reason. (A manager's own request goes to their manager, the director.)
  const chairs = newRequest(morgan, 'Summit Office Interiors', 'New vendor', 620000, 'Ergonomic chairs for the operations office.')
  then(chairs, (r) => reject(daniel, r, org, 'Please order through our contracted furniture vendor instead.'))
}

export function isEmpty(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0
}
