import { useEffect, useState } from 'react'

function AttributeManagement({ supabase }) {
  const [attributes, setAttributes] = useState([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function loadAttributes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('supply_attributes')
      .select('*')
      .order('name', { ascending: true })

    if (error) setErrorMessage(error.message)
    else setAttributes(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAttributes()
  }, [supabase])

  function resetForm() {
    setName('')
    setEditingId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const cleanedName = name.trim()
    if (!cleanedName || saving) return

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    const query = editingId
      ? supabase.from('supply_attributes').update({ name: cleanedName, updated_at: new Date().toISOString() }).eq('id', editingId)
      : supabase.from('supply_attributes').insert({ name: cleanedName })
    const { error } = await query

    if (error) setErrorMessage(error.code === '23505' ? 'An attribute with that name already exists.' : error.message)
    else {
      setSuccessMessage(editingId ? 'Attribute updated.' : 'Attribute added.')
      resetForm()
      await loadAttributes()
    }
    setSaving(false)
  }

  async function toggleActive(attribute) {
    const isActive = !attribute.is_active
    setErrorMessage('')
    setSuccessMessage('')
    const { error } = await supabase
      .from('supply_attributes')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', attribute.id)

    if (error) setErrorMessage(error.message)
    else {
      setAttributes((current) => current.map((entry) =>
        entry.id === attribute.id ? { ...entry, is_active: isActive } : entry,
      ))
      setSuccessMessage(isActive ? 'Attribute activated.' : 'Attribute deactivated.')
    }
  }

  return (
    <section className="attribute-management" aria-labelledby="attributes-title">
      <div className="users-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / ITEM SETUP</p>
          <h1 id="attributes-title">Attributes</h1>
          <p>Define reusable item details that can be searched in the request catalog.</p>
        </div>
        <div className="users-count"><strong>{attributes.filter((attribute) => attribute.is_active).length}</strong><span>ACTIVE</span></div>
      </div>

      <div className="attribute-layout">
        <section className="attribute-form-section" aria-labelledby="attribute-form-title">
          <div className="section-heading">
            <p className="eyebrow">{editingId ? 'EDIT FIELD' : 'NEW FIELD'}</p>
            <h2 id="attribute-form-title">{editingId ? 'Update attribute' : 'Add an attribute'}</h2>
          </div>
          <form className="item-form" onSubmit={handleSubmit}>
            <label htmlFor="attribute-name">Attribute name</label>
            <input
              id="attribute-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Adhesive type"
              maxLength={80}
              required
            />
            <div className="form-actions">
              <button className="submit-button" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add attribute'}
                <span aria-hidden="true">&gt;</span>
              </button>
              {editingId && <button className="cancel-button" type="button" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="attribute-list-section" aria-labelledby="attribute-list-title">
          <div className="section-heading">
            <p className="eyebrow">REUSABLE ITEM FIELDS</p>
            <h2 id="attribute-list-title">Available attributes <span>{attributes.length}</span></h2>
          </div>
          {errorMessage && <p className="inventory-message error-message" role="alert">{errorMessage}</p>}
          {successMessage && <p className="inventory-message success-message" role="status">{successMessage}</p>}
          {loading ? <p className="table-empty">Loading attributes...</p> : (
            <div className="attribute-list">
              {attributes.length ? attributes.map((attribute) => (
                <div className="attribute-row" key={attribute.id}>
                  <div>
                    <strong>{attribute.name}</strong>
                    <span className={`availability-badge ${attribute.is_active ? 'available' : 'unavailable'}`}>
                      {attribute.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => { setEditingId(attribute.id); setName(attribute.name) }}>Edit</button>
                    <button type="button" onClick={() => toggleActive(attribute)}>{attribute.is_active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </div>
              )) : <p className="table-empty">No attributes configured.</p>}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export default AttributeManagement
