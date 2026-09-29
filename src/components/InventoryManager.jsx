import { useEffect, useState } from 'react'
import BrandLockup from './BrandLockup'
import AttributeManagement from './AttributeManagement'
import DepartmentManagement from './DepartmentManagement'
import UserManagement from './UserManagement'

const emptyItem = {
  name: '',
  category: '',
  description: '',
  unit: 'piece',
  quantity: '0',
  is_available: true,
  itemAttributes: [],
}

function formatDatabaseError(error) {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return 'Inventory or attribute tables are missing. Run the latest supabase/schema.sql in your Supabase SQL Editor.'
  }
  if (error.code === '42501') {
    return 'Supabase denied this operation. Confirm this account has the ADMIN app_metadata role and the table policies are installed.'
  }
  return error.message || 'Supabase could not complete the request.'
}

function displayUnit(unit, quantity) {
  if (quantity === 1) return unit
  if (unit === 'piece') return 'pieces'
  if (unit === 'box') return 'boxes'
  if (unit === 'other') return 'other units'
  return `${unit}s`
}

function InventoryManager({ supabase, email, onSignOut, signingOut }) {
  const [activeView, setActiveView] = useState('inventory')
  const [items, setItems] = useState([])
  const [attributeDefinitions, setAttributeDefinitions] = useState([])
  const [loading, setLoading] = useState(true)
  const [databaseStatus, setDatabaseStatus] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyItem)

  async function loadCatalog(isActive = () => true) {
    setLoading(true)
    try {
      const [itemResult, definitionResult, assignmentResult, valueResult] = await Promise.all([
        supabase.from('supply_items').select('*').order('name', { ascending: true }),
        supabase.from('supply_attributes').select('*').order('name', { ascending: true }),
        supabase.from('supply_item_attributes').select('item_id, attribute_id, is_required'),
        supabase.from('supply_item_attribute_values').select('item_id, attribute_id, value'),
      ])
      if (!isActive()) return false

      const error = itemResult.error || definitionResult.error || assignmentResult.error || valueResult.error
      if (error) {
        setErrorMessage(formatDatabaseError(error))
        setDatabaseStatus('error')
        return false
      }

      const definitions = definitionResult.data ?? []
      const definitionById = new Map(definitions.map((attribute) => [attribute.id, attribute]))
      const valuesByKey = new Map()
      for (const attributeValue of valueResult.data ?? []) {
        const key = `${attributeValue.item_id}:${attributeValue.attribute_id}`
        const currentValues = valuesByKey.get(key) ?? []
        currentValues.push(attributeValue.value)
        valuesByKey.set(key, currentValues)
      }

      const attributesByItem = new Map()
      for (const assignment of assignmentResult.data ?? []) {
        const definition = definitionById.get(assignment.attribute_id)
        if (!definition) continue
        const key = `${assignment.item_id}:${assignment.attribute_id}`
        const itemAttributes = attributesByItem.get(assignment.item_id) ?? []
        itemAttributes.push({
          attribute_id: assignment.attribute_id,
          name: definition.name,
          is_required: assignment.is_required,
          valuesText: (valuesByKey.get(key) ?? []).join(', '),
        })
        attributesByItem.set(assignment.item_id, itemAttributes)
      }

      setAttributeDefinitions(definitions)
      setItems((itemResult.data ?? []).map((item) => ({
        ...item,
        itemAttributes: attributesByItem.get(item.id) ?? [],
      })))
      setErrorMessage('')
      setDatabaseStatus('connected')
      return true
    } catch {
      if (isActive()) {
        setErrorMessage('Could not reach Supabase. Check the project URL and your network connection.')
        setDatabaseStatus('error')
      }
      return false
    } finally {
      if (isActive()) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    loadCatalog(() => active)
    return () => { active = false }
  }, [supabase])

  const filteredItems = items.filter((item) =>
    `${item.name} ${item.category} ${item.description} ${item.itemAttributes.map((attribute) => `${attribute.name} ${attribute.valuesText}`).join(' ')}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  const availableCount = items.filter((item) => item.is_available).length
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0)

  function resetForm() {
    setForm(emptyItem)
    setEditingId(null)
  }

  function startEditing(item) {
    setForm({
      name: item.name,
      category: item.category,
      description: item.description ?? '',
      unit: item.unit,
      quantity: String(item.quantity),
      is_available: item.is_available,
      itemAttributes: item.itemAttributes,
    })
    setEditingId(item.id)
    setSuccessMessage('')
    setErrorMessage('')
  }

  function toggleItemAttribute(attribute, isSelected) {
    setForm((currentForm) => ({
      ...currentForm,
      itemAttributes: isSelected
        ? [
          ...currentForm.itemAttributes,
          { attribute_id: attribute.id, name: attribute.name, is_required: false, valuesText: '' },
        ]
        : currentForm.itemAttributes.filter((entry) => entry.attribute_id !== attribute.id),
    }))
  }

  function updateItemAttribute(attributeId, updates) {
    setForm((currentForm) => ({
      ...currentForm,
      itemAttributes: currentForm.itemAttributes.map((entry) =>
        entry.attribute_id === attributeId ? { ...entry, ...updates } : entry,
      ),
    }))
  }

  async function refreshItems() {
    return loadCatalog()
  }

  async function handleSave(event) {
    event.preventDefault()
    if (saving) return

    const quantity = Number(form.quantity)
    if (!Number.isInteger(quantity) || quantity < 0) {
      setErrorMessage('Enter a whole-number stock quantity of zero or more.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || 'General',
      description: form.description.trim(),
      unit: form.unit,
      quantity,
      is_available: form.is_available && quantity > 0,
      updated_at: new Date().toISOString(),
    }

    try {
      const query = editingId
        ? supabase.from('supply_items').update(payload).eq('id', editingId).select('id').single()
        : supabase.from('supply_items').insert(payload).select('id').single()
      const { data: savedItem, error } = await query

      if (error) {
        setErrorMessage(formatDatabaseError(error))
        setDatabaseStatus('error')
        return
      }

      const activeAttributeIds = new Set(
        attributeDefinitions.filter((attribute) => attribute.is_active).map((attribute) => attribute.id),
      )
      const attributes = form.itemAttributes
        .filter((attribute) => activeAttributeIds.has(attribute.attribute_id))
        .map((attribute) => ({
        attribute_id: attribute.attribute_id,
        is_required: attribute.is_required,
        values: attribute.valuesText
          .split(/[,\n;]/)
          .map((value) => value.trim())
          .filter(Boolean),
        }))
      const { error: attributeError } = await supabase.rpc('replace_supply_item_attributes', {
        p_item_id: savedItem.id,
        p_attributes: attributes,
      })

      if (attributeError) {
        setErrorMessage(`Item saved, but its attributes could not be saved: ${formatDatabaseError(attributeError)}`)
        setDatabaseStatus('error')
        return
      }

      if (await refreshItems()) {
        setSuccessMessage(editingId ? 'Item updated.' : 'Item added to inventory.')
      } else {
        setErrorMessage('Saved successfully, but the inventory could not refresh. Reload the page before retrying.')
      }
      resetForm()
    } catch {
      setErrorMessage('Could not reach Supabase. Check the project URL and your network connection.')
      setDatabaseStatus('error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailability(item) {
    if (!item.is_available && item.quantity === 0) {
      setErrorMessage('Add stock before making this item available for requests.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    const nextValue = !item.is_available
    try {
      const { error } = await supabase
        .from('supply_items')
        .update({ is_available: nextValue, updated_at: new Date().toISOString() })
        .eq('id', item.id)

      if (error) {
        setErrorMessage(formatDatabaseError(error))
        setDatabaseStatus('error')
        return
      }
    } catch {
      setErrorMessage('Could not reach Supabase. Check the project URL and your network connection.')
      setDatabaseStatus('error')
      return
    }

    setDatabaseStatus('connected')
    setItems((currentItems) => currentItems.map((currentItem) =>
      currentItem.id === item.id ? { ...currentItem, is_available: nextValue } : currentItem,
    ))
  }

  return (
    <section className="inventory-workspace" aria-label="Primetech Oil admin workspace">
      <aside className="admin-sidebar">
        <div className="sidebar-brand"><BrandLockup /></div>
        <p className="sidebar-section-label">ADMIN MODULES</p>
        <nav className="admin-tabs" role="tablist" aria-label="Admin sections">
          <button
            id="inventory-tab"
            type="button"
            role="tab"
            aria-selected={activeView === 'inventory'}
            aria-controls="inventory-panel"
            onClick={() => {
              setActiveView('inventory')
              loadCatalog()
            }}
          ><span className="nav-index" aria-hidden="true">01</span>Inventory</button>
          <button
            id="users-tab"
            type="button"
            role="tab"
            aria-selected={activeView === 'users'}
            aria-controls="users-panel"
            onClick={() => setActiveView('users')}
          ><span className="nav-index" aria-hidden="true">02</span>Users</button>
          <button
            id="attributes-tab"
            type="button"
            role="tab"
            aria-selected={activeView === 'attributes'}
            aria-controls="attributes-panel"
            onClick={() => setActiveView('attributes')}
          ><span className="nav-index" aria-hidden="true">03</span>Attributes</button>
          <button
            id="departments-tab"
            type="button"
            role="tab"
            aria-selected={activeView === 'departments'}
            aria-controls="departments-panel"
            onClick={() => setActiveView('departments')}
          ><span className="nav-index" aria-hidden="true">04</span>Departments</button>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />ADMINISTRATOR</div>
      </aside>

      <div className="admin-main">
        <header className="inventory-topline">
          <span className="admin-page-label">{activeView === 'inventory' ? 'Inventory' : activeView === 'users' ? 'User management' : activeView === 'attributes' ? 'Attributes' : 'Departments'}</span>
          <div className="inventory-account">
            <span className="account-email">{email}</span>
            <button className="sign-out-button" type="button" onClick={onSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </header>

        {activeView === 'inventory' ? (
          <div id="inventory-panel" role="tabpanel" aria-labelledby="inventory-tab">
            <div className="inventory-heading">
              <div>
                <p className="eyebrow">ADMINISTRATION / INVENTORY</p>
                <h1 id="workspace-title">Office supplies</h1>
                <p className="workspace-intro">Manage the items and quantities available for requests.</p>
              </div>
              <div className={`database-indicator ${databaseStatus === 'loading' ? 'is-loading' : databaseStatus === 'error' ? 'has-error' : 'is-connected'}`} role="status">
                <span className="status-dot" />
                {databaseStatus === 'loading' ? 'CHECKING SUPABASE' : databaseStatus === 'error' ? 'DATABASE NEEDS ATTENTION' : 'SUPABASE CONNECTED'}
              </div>
            </div>

            <div className="inventory-stats" aria-label="Inventory summary">
              <div><span>ITEM TYPES</span><strong>{items.length}</strong></div>
              <div><span>AVAILABLE TO REQUEST</span><strong>{availableCount}</strong></div>
              <div><span>TOTAL STOCK</span><strong>{totalQuantity}</strong></div>
            </div>

            <div className="inventory-content">
              <section className="item-form-section" aria-labelledby="item-form-title">
                <div className="section-heading">
                  <p className="eyebrow">{editingId ? 'EDIT INVENTORY' : 'NEW INVENTORY'}</p>
                  <h2 id="item-form-title">{editingId ? 'Update item' : 'Add an item'}</h2>
                </div>
                <form className="item-form" onSubmit={handleSave}>
                  <label htmlFor="item-name">Item name</label>
                  <input
                    id="item-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Ballpen"
                    maxLength={120}
                    required
                  />

                  <label htmlFor="item-category">Category</label>
                  <input
                    id="item-category"
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    placeholder="Writing supplies"
                    maxLength={80}
                  />

                  <label htmlFor="item-description">Description</label>
                  <textarea
                    id="item-description"
                    className="item-description-input"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Brief item details"
                    maxLength={500}
                    rows={3}
                  />

                  <fieldset className="item-attributes-fieldset">
                    <legend>Flexible attributes</legend>
                    <p>Choose any fields for this item. They are optional unless marked required.</p>
                    {attributeDefinitions.length ? attributeDefinitions.map((attribute) => {
                      const selected = form.itemAttributes.find((entry) => entry.attribute_id === attribute.id)
                      const inputId = `item-attribute-${attribute.id}`
                      return (
                        <div className="item-attribute-config" key={attribute.id}>
                          <label className="attribute-choice" htmlFor={inputId}>
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={Boolean(selected)}
                              disabled={!attribute.is_active && !selected}
                              onChange={(event) => toggleItemAttribute(attribute, event.target.checked)}
                            />
                            <span>{attribute.name}{attribute.is_active ? '' : ' (inactive)'}</span>
                          </label>
                          {selected && (
                            <div className="attribute-config-details">
                              <label htmlFor={`${inputId}-values`}>Searchable values (optional)</label>
                              <textarea
                                id={`${inputId}-values`}
                                value={selected.valuesText}
                                onChange={(event) => updateItemAttribute(attribute.id, { valuesText: event.target.value })}
                                placeholder="Separate values with commas, e.g. Pilot, BIC"
                                rows={2}
                              />
                              <label className="attribute-required-control">
                                <input
                                  type="checkbox"
                                  checked={selected.is_required}
                                  onChange={(event) => updateItemAttribute(attribute.id, { is_required: event.target.checked })}
                                />
                                <span>Require requestor to fill this field</span>
                              </label>
                            </div>
                          )}
                        </div>
                      )
                    }) : <span className="attribute-none">Create reusable fields in Attributes first.</span>}
                  </fieldset>

                  <div className="form-split">
                    <div>
                      <label htmlFor="item-unit">Unit</label>
                      <select id="item-unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
                        <option value="piece">Piece</option>
                        <option value="pack">Pack</option>
                        <option value="box">Box</option>
                        <option value="bottle">Bottle</option>
                        <option value="ream">Ream</option>
                        <option value="set">Set</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="item-quantity">Stock quantity</label>
                      <input
                        id="item-quantity"
                        type="number"
                        min="0"
                        step="1"
                        value={form.quantity}
                        onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <label className="availability-control">
                    <input
                      type="checkbox"
                      checked={form.is_available && Number(form.quantity) > 0}
                      disabled={Number(form.quantity) === 0}
                      onChange={(event) => setForm({ ...form, is_available: event.target.checked })}
                    />
                    <span><strong>Available for requests</strong><small>{Number(form.quantity) === 0 ? 'Add stock before enabling requests.' : 'Requestors can select this item when enabled.'}</small></span>
                  </label>

                  <div className="form-actions">
                    <button className="submit-button" type="submit" disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add to inventory'}
                      <span aria-hidden="true">&gt;</span>
                    </button>
                    {editingId && <button className="cancel-button" type="button" onClick={resetForm}>Cancel</button>}
                  </div>
                </form>
              </section>

              <section className="item-list-section" aria-labelledby="item-list-title">
                <div className="list-heading">
                  <div className="section-heading">
                    <p className="eyebrow">CURRENT CATALOG</p>
                    <h2 id="item-list-title">Inventory items <span>{items.length}</span></h2>
                  </div>
                  <label className="search-field">
                    <span className="sr-only">Search inventory</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" />
                  </label>
                </div>

                {errorMessage && <p className="inventory-message error-message" role="alert">{errorMessage}</p>}
                {successMessage && <p className="inventory-message success-message" role="status">{successMessage}</p>}

                <div className="item-table-wrap">
                  <table className="item-table">
                    <thead>
                      <tr><th scope="col">ITEM</th><th scope="col">STOCK</th><th scope="col">REQUEST STATUS</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td className="table-empty" colSpan="4">Loading inventory...</td></tr>
                      ) : filteredItems.length ? filteredItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <span className="item-category">{item.category || 'General'}</span>
                            {item.itemAttributes.length > 0 && (
                              <span className="item-attribute-summary">
                                {item.itemAttributes.map((attribute) => `${attribute.name}: ${attribute.valuesText || 'unspecified'}`).join(' | ')}
                              </span>
                            )}
                          </td>
                          <td><strong>{item.quantity}</strong><span className="item-category">{displayUnit(item.unit, item.quantity)}</span></td>
                          <td><span className={`availability-badge ${item.is_available ? 'available' : 'unavailable'}`}>{item.is_available ? 'Available' : 'Unavailable'}</span></td>
                          <td className="row-actions">
                            <button type="button" onClick={() => startEditing(item)}>Edit</button>
                            <button type="button" onClick={() => toggleAvailability(item)}>{item.is_available ? 'Disable' : 'Enable'}</button>
                          </td>
                        </tr>
                      )) : (
                        <tr><td className="table-empty" colSpan="4">{search ? 'No items match your search.' : 'No supplies yet. Add the first item to start your catalog.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        ) : activeView === 'users' ? (
          <div id="users-panel" role="tabpanel" aria-labelledby="users-tab">
            <UserManagement supabase={supabase} />
          </div>
        ) : activeView === 'attributes' ? (
          <div id="attributes-panel" role="tabpanel" aria-labelledby="attributes-tab">
            <AttributeManagement supabase={supabase} />
          </div>
        ) : (
          <div id="departments-panel" role="tabpanel" aria-labelledby="departments-tab">
            <DepartmentManagement supabase={supabase} />
          </div>
        )}
        <footer className="page-footer"><span>SUPPLY OPERATIONS</span><span>AUTHORIZED PERSONNEL ONLY</span></footer>
      </div>
    </section>
  )
}

export default InventoryManager
