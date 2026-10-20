// Demo users and departments. All names are made up (synthetic data only).
//
// Org chart:
//   Victoria Hale (VP of Finance)
//   ├── Dana Whitfield (Finance – view only)
//   └── Daniel Ortiz (Director of Operations and Warehouse)
//       ├── Morgan Lee (Manager, Operations) ── Alex Chen (Employee)
//       └── Jordan Blake (Manager, Warehouse) ── Taylor Brooks (Employee)

const DEPARTMENTS = [
  { id: 1, name: 'Operations' },
  { id: 2, name: 'Warehouse' },
  { id: 3, name: 'Finance' },
]

// Listed top-down so every manager is inserted before the people who report to them.
const USERS = [
  { id: 1, name: 'Victoria Hale', role: 'vp_finance', departmentId: 3, managerId: null },
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
  db.exec('BEGIN')
  try {
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

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function isEmpty(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0
}
