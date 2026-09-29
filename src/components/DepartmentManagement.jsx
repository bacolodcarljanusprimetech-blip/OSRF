import { useEffect, useState } from 'react'

function DepartmentManagement({ supabase }) {
  const [departments, setDepartments] = useState([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function loadDepartments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name', { ascending: true })

    if (error) setErrorMessage(error.message)
    else setDepartments(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadDepartments()
  }, [supabase])

  function resetForm() {
    setName('')
    setEditingId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim() || saving) return

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    const query = editingId
      ? supabase.from('departments').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', editingId)
      : supabase.from('departments').insert({ name: name.trim() })
    const { error } = await query

    if (error) {
      setErrorMessage(error.code === '23505' ? 'A department with this name already exists.' : error.message)
    } else {
      setSuccessMessage(editingId ? 'Department updated.' : 'Department added.')
      resetForm()
      await loadDepartments()
    }
    setSaving(false)
  }

  async function toggleActive(department) {
    const isActive = !department.is_active
    setErrorMessage('')
    setSuccessMessage('')
    const { error } = await supabase
      .from('departments')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', department.id)

    if (error) setErrorMessage(error.message)
    else {
      setDepartments((current) => current.map((entry) =>
        entry.id === department.id ? { ...entry, is_active: isActive } : entry,
      ))
      setSuccessMessage(isActive ? 'Department activated.' : 'Department deactivated.')
    }
  }

  return (
    <section className="attribute-management" aria-labelledby="departments-title">
      <div className="users-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / REQUEST SETUP</p>
          <h1 id="departments-title">Departments</h1>
          <p>Active departments appear in the public request form.</p>
        </div>
        <div className="users-count"><strong>{departments.filter((department) => department.is_active).length}</strong><span>ACTIVE</span></div>
      </div>

      <div className="attribute-layout">
        <section className="attribute-form-section" aria-labelledby="department-form-title">
          <div className="section-heading">
            <p className="eyebrow">{editingId ? 'EDIT DEPARTMENT' : 'NEW DEPARTMENT'}</p>
            <h2 id="department-form-title">{editingId ? 'Update department' : 'Add a department'}</h2>
          </div>
          <form className="item-form" onSubmit={handleSubmit}>
            <label htmlFor="department-name">Department name</label>
            <input
              id="department-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Operations"
              maxLength={100}
              required
            />
            <div className="form-actions">
              <button className="submit-button" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add department'}
                <span aria-hidden="true">&gt;</span>
              </button>
              {editingId && <button className="cancel-button" type="button" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="attribute-list-section" aria-labelledby="department-list-title">
          <div className="section-heading">
            <p className="eyebrow">REQUEST FORM OPTIONS</p>
            <h2 id="department-list-title">All departments <span>{departments.length}</span></h2>
          </div>
          {errorMessage && <p className="inventory-message error-message" role="alert">{errorMessage}</p>}
          {successMessage && <p className="inventory-message success-message" role="status">{successMessage}</p>}
          {loading ? <p className="table-empty">Loading departments...</p> : (
            <div className="attribute-list">
              {departments.length ? departments.map((department) => (
                <div className="attribute-row" key={department.id}>
                  <div>
                    <strong>{department.name}</strong>
                    <span className={`availability-badge ${department.is_active ? 'available' : 'unavailable'}`}>
                      {department.is_active ? 'Available on form' : 'Hidden from form'}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => { setEditingId(department.id); setName(department.name) }}>Edit</button>
                    <button type="button" onClick={() => toggleActive(department)}>{department.is_active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </div>
              )) : <p className="table-empty">No departments configured.</p>}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export default DepartmentManagement
