import { useEffect, useState } from 'react'

const initialForm = { full_name: '', email: '', role: 'APPROVER', password: '', confirmPassword: '' }

async function invokeAdmin(supabase, action, values = {}) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...values },
  })

  if (error) {
    let message = error.message
    if (error.context instanceof Response) {
      const details = await error.context.json().catch(() => null)
      if (details?.error) message = details.error
    }
    throw new Error(message)
  }

  return data
}

function UserManagement({ supabase }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState(initialForm)

  async function loadUsers() {
    setLoading(true)
    setErrorMessage('')
    try {
      const result = await invokeAdmin(supabase, 'list')
      setUsers(result.users ?? [])
    } catch (error) {
      setErrorMessage(error.message || 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [supabase])

  const query = search.trim().toLowerCase()
  const filteredUsers = query
    ? users.filter((user) => `${user.full_name} ${user.email} ${user.role}`.toLowerCase().includes(query))
    : users

  function startEditing(user) {
    setEditingUser(user)
    setForm({ full_name: user.full_name, email: user.email, role: user.role })
    setErrorMessage('')
    setSuccessMessage('')
  }

  function resetForm() {
    setEditingUser(null)
    setForm(initialForm)
    setShowPassword(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    if (!editingUser && form.password.length < 8) {
      setErrorMessage('Use an initial password with at least 8 characters.')
      return
    }
    if (!editingUser && form.password !== form.confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    const action = editingUser ? 'update' : 'create'
    const values = editingUser
      ? { id: editingUser.id, full_name: form.full_name, email: form.email, role: form.role }
      : { full_name: form.full_name, email: form.email, role: form.role, password: form.password }

    try {
      const result = await invokeAdmin(supabase, action, values)
      setSuccessMessage(result.message ?? (editingUser ? 'User updated.' : 'Account created.'))
      resetForm()
      await loadUsers()
    } catch (error) {
      setErrorMessage(error.message || 'Could not save this user.')
    } finally {
      setSaving(false)
    }
  }

  async function changeActiveState(user) {
    const nextState = !user.is_active
    const confirmation = nextState
      ? `Activate ${user.full_name}?`
      : `Deactivate ${user.full_name}? They will no longer be able to sign in.`
    if (!window.confirm(confirmation)) return

    setErrorMessage('')
    setSuccessMessage('')
    try {
      const result = await invokeAdmin(supabase, 'set-active', {
        id: user.id,
        is_active: nextState,
      })
      setSuccessMessage(result.message)
      setUsers((currentUsers) => currentUsers.map((currentUser) =>
        currentUser.id === user.id ? { ...currentUser, is_active: nextState } : currentUser,
      ))
    } catch (error) {
      setErrorMessage(error.message || 'Could not update this account.')
    }
  }

  async function deleteUser(user) {
    const confirmed = window.confirm(
      `Permanently delete ${user.full_name} (${user.email})? This cannot be undone.`,
    )
    if (!confirmed) return

    setErrorMessage('')
    setSuccessMessage('')
    try {
      const result = await invokeAdmin(supabase, 'delete', { id: user.id })
      setUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== user.id))
      if (editingUser?.id === user.id) resetForm()
      setSuccessMessage(result.message)
    } catch (error) {
      setErrorMessage(error.message || 'Could not delete this user.')
    }
  }

  async function sendPasswordReset(user) {
    if (!window.confirm(`Send a password reset email to ${user.email}?`)) return

    setErrorMessage('')
    setSuccessMessage('')
    try {
      const result = await invokeAdmin(supabase, 'send-reset', { id: user.id })
      setSuccessMessage(result.message)
    } catch (error) {
      setErrorMessage(error.message || 'Could not send the reset email.')
    }
  }

  return (
    <section className="user-management" aria-labelledby="users-title">
      <div className="users-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / ACCESS</p>
          <h1 id="users-title">User management</h1>
          <p>Invite and manage the people who review and release supplies.</p>
        </div>
        <div className="users-count"><strong>{users.length}</strong><span>ACCOUNTS</span></div>
      </div>

      <div className="users-layout">
        <section className="user-form-section" aria-labelledby="user-form-title">
          <div className="section-heading">
            <p className="eyebrow">{editingUser ? 'EDIT ACCOUNT' : 'NEW ACCOUNT'}</p>
            <h2 id="user-form-title">{editingUser ? 'Update user' : 'Invite a user'}</h2>
          </div>
          <p className="user-form-help">Create accounts without email. Set an initial password and share it securely; passwords cannot be viewed after creation.</p>
          <form className="item-form" onSubmit={handleSubmit}>
            <label htmlFor="user-full-name">Full name</label>
            <input
              id="user-full-name"
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              placeholder="Alex Santos"
              maxLength={120}
              required
            />
            <label htmlFor="user-email">Email address</label>
            <input
              id="user-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="alex@company.com"
              required
            />
            <label htmlFor="user-role">Assigned role</label>
            <select id="user-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="APPROVER">Approver</option>
              <option value="RECEIVER">Receiver</option>
            </select>
            {!editingUser && (
              <>
                <div className="password-label-row">
                  <label htmlFor="user-password">Initial password</label>
                  <button className="reveal-button" type="button" onClick={() => setShowPassword((visible) => !visible)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength="8"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
                <label htmlFor="user-password-confirm">Confirm password</label>
                <input
                  id="user-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength="8"
                  value={form.confirmPassword}
                  onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                  required
                />
              </>
            )}
            <div className="form-actions">
              <button className="submit-button" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingUser ? 'Save changes' : 'Create account'}
                <span aria-hidden="true">&gt;</span>
              </button>
              {editingUser && <button className="cancel-button" type="button" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="users-list-section" aria-labelledby="users-list-title">
          <div className="list-heading">
            <div className="section-heading">
              <p className="eyebrow">SYSTEM ACCOUNTS</p>
              <h2 id="users-list-title">People <span>{users.length}</span></h2>
            </div>
            <div className="users-list-tools">
              <label className="search-field">
                <span className="sr-only">Search users</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" />
              </label>
              <button className="refresh-button" type="button" onClick={loadUsers} disabled={loading}>Refresh</button>
            </div>
          </div>

          {errorMessage && <p className="inventory-message error-message" role="alert">{errorMessage}</p>}
          {successMessage && <p className="inventory-message success-message" role="status">{successMessage}</p>}

          <div className="item-table-wrap">
            <table className="item-table users-table">
              <thead>
                <tr><th scope="col">USER</th><th scope="col">ROLE</th><th scope="col">STATUS</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="table-empty" colSpan="4">Loading users...</td></tr>
                ) : filteredUsers.length ? filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.full_name}</strong><span className="item-category">{user.email}</span></td>
                    <td><span className={`role-badge role-${user.role.toLowerCase()}`}>{user.role}</span></td>
                    <td><span className={`availability-badge ${user.is_active ? 'available' : 'unavailable'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="row-actions user-actions">
                      {user.role !== 'ADMIN' ? (
                        <>
                          <button type="button" onClick={() => startEditing(user)}>Edit</button>
                          <button type="button" onClick={() => changeActiveState(user)}>{user.is_active ? 'Deactivate' : 'Activate'}</button>
                          <button type="button" onClick={() => sendPasswordReset(user)} disabled={!user.is_active}>Reset access</button>
                          <button className="delete-user-button" type="button" onClick={() => deleteUser(user)}>Delete</button>
                        </>
                      ) : <span className="self-admin-label">Protected</span>}
                    </td>
                  </tr>
                )) : (
                  <tr><td className="table-empty" colSpan="4">{search ? 'No users match your search.' : 'No accounts yet. Invite an approver or receiver to get started.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  )
}

export default UserManagement
