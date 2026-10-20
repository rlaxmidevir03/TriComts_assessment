import { ROLE_LABELS } from '../format.js'

// Demo sign-in: pick who you are from a dropdown. No passwords (the brief says real
// authentication isn't needed). Microsoft sign-in would replace this component.
export default function UserSwitcher({ users, currentUser, onChange }) {
  return (
    <label className="user-switcher">
      Viewing as{' '}
      <select value={currentUser?.id ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} – {ROLE_LABELS[u.role]}, {u.departmentName}
          </option>
        ))}
      </select>
      <span className="demo-tag">demo sign-in</span>
    </label>
  )
}
