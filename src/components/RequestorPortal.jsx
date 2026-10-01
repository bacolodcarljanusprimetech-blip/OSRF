import { useEffect, useState } from 'react'
import BrandLockup from './BrandLockup'
import ReleaseReceipt from './ReleaseReceipt'

function formatDate(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function RequestorPortal({ supabase }) {
  const query = new URLSearchParams(window.location.search)
  const [view, setView] = useState(query.get('mode') === 'track' ? 'track' : 'request')
  const [catalog, setCatalog] = useState([])
  const [departments, setDepartments] = useState([])
  const [departmentError, setDepartmentError] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [cart, setCart] = useState([])
  const [requestorName, setRequestorName] = useState('')
  const [department, setDepartment] = useState('')
  const [remarks, setRemarks] = useState('')
  const [requestError, setRequestError] = useState('')
  const [stockIssue, setStockIssue] = useState('')
  const [stockBlockedItemId, setStockBlockedItemId] = useState('')
  const [unavailableItemId, setUnavailableItemId] = useState('')
  const [stockAvailableQuantity, setStockAvailableQuantity] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [trackCode, setTrackCode] = useState(query.get('id') ?? '')
  const [tracking, setTracking] = useState(false)
  const [trackingError, setTrackingError] = useState('')
  const [trackedRequest, setTrackedRequest] = useState(null)
  const [showTrackedReceipt, setShowTrackedReceipt] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')

  async function loadDepartments() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('departments')
      .select('name')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) setDepartmentError('Departments are unavailable. Please try again later.')
    else {
      setDepartments(data ?? [])
      setDepartmentError('')
    }
  }

  useEffect(() => {
    loadDepartments()
  }, [supabase])

  useEffect(() => {
    let isCurrentSearch = true
    const timeout = window.setTimeout(async () => {
      if (!supabase) {
        setCatalogError('The request catalog is not configured yet.')
        setCatalogLoading(false)
        return
      }

      setCatalogLoading(true)
      setCatalogError('')
      try {
        const { data, error } = await supabase.rpc('search_requestable_supply_items', {
          search_text: catalogSearch.trim() || null,
        })
        if (!isCurrentSearch) return
        if (error) {
          setCatalogError('The request catalog is unavailable. Please try again later.')
          return
        }

        setCatalog(data ?? [])
      } catch {
        if (isCurrentSearch) setCatalogError('The request catalog is unavailable. Please try again later.')
      } finally {
        if (isCurrentSearch) setCatalogLoading(false)
      }
    }, catalogSearch.trim() ? 250 : 0)

    return () => {
      isCurrentSearch = false
      window.clearTimeout(timeout)
    }
  }, [catalogSearch, supabase])

  useEffect(() => {
    if (!toastMessage) return undefined
    const timeout = window.setTimeout(() => setToastMessage(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  function addItem(item) {
    if (item.id === stockBlockedItemId) {
      setToastMessage(stockIssue)
      return
    }

    setCart((current) => [
      ...current,
      {
        lineId: crypto.randomUUID(),
        item,
        quantity: '1',
        attributes: Object.fromEntries((item.attributes ?? []).map((attribute) => [attribute.id, ''])),
      },
    ])
    setRequestError('')
  }

  function updateStockBlockForCart(nextCart) {
    if (!stockBlockedItemId) return

    const blockedLines = nextCart.filter((line) => line.item.id === stockBlockedItemId)
    if (blockedLines.length === 0) {
      setStockIssue('')
      setStockBlockedItemId('')
      setUnavailableItemId('')
      setStockAvailableQuantity(null)
      setToastMessage('')
      return
    }

    if (unavailableItemId === stockBlockedItemId || stockAvailableQuantity === null) return

    const quantities = blockedLines.map((line) => Number(line.quantity))
    const requestedQuantity = quantities.reduce((total, quantity) => total + quantity, 0)
    if (quantities.every((quantity) => Number.isInteger(quantity) && quantity > 0)
      && requestedQuantity <= stockAvailableQuantity) {
      setStockIssue('')
      setStockBlockedItemId('')
      setUnavailableItemId('')
      setStockAvailableQuantity(null)
      setToastMessage('')
      return
    }

    const itemName = blockedLines[0].item.name
    setStockIssue(`${itemName} has only ${stockAvailableQuantity} in stock. Reduce the total quantity to ${stockAvailableQuantity} or fewer.`)
  }

  function updateLine(lineId, updates) {
    const nextCart = cart.map((line) => line.lineId === lineId ? { ...line, ...updates } : line)
    setCart(nextCart)
    if (updates.quantity !== undefined) updateStockBlockForCart(nextCart)
  }

  function updateLineAttribute(lineId, attributeId, value) {
    setCart((current) => current.map((line) => line.lineId === lineId
      ? { ...line, attributes: { ...line.attributes, [attributeId]: value } }
      : line,
    ))
  }

  async function handleSubmitRequest(event) {
    event.preventDefault()
    if (!supabase || submitting) return
    if (stockIssue) {
      setToastMessage(stockIssue)
      return
    }
    if (cart.length === 0) {
      setRequestError('Add at least one item to your request.')
      return
    }

    setSubmitting(true)
    setRequestError('')
    const items = cart.map((line) => ({
      supply_item_id: line.item.id,
      quantity: Number(line.quantity),
      attributes: line.attributes,
    }))

    try {
      const { data, error } = await supabase.rpc('submit_supply_request', {
        p_requestor_name: requestorName.trim(),
        p_department: department.trim(),
        p_remarks: remarks.trim(),
        p_items: items,
      })
      if (error) throw error

      const result = Array.isArray(data) ? data[0] : data
      if (!result?.reference_code) throw new Error('The request was received but its tracking number was not returned.')
      setTrackedRequest(result)
      setTrackCode(result.reference_code)
      setCart([])
      setStockIssue('')
      setStockBlockedItemId('')
      setUnavailableItemId('')
      setStockAvailableQuantity(null)
      setToastMessage('')
      setRequestorName('')
      setDepartment('')
      setRemarks('')
      setView('track')
      window.history.replaceState({}, '', `/request?mode=track&id=${encodeURIComponent(result.reference_code)}`)
    } catch (error) {
      const message = error.message || 'Your request could not be submitted. Please try again.'
      if (message.includes('STOCK_UNAVAILABLE:')) {
        const stockMessage = message.replace(/^.*?STOCK_UNAVAILABLE:\s*/, '')
        const details = typeof error.details === 'string' ? error.details.split('|') : []
        setStockIssue(stockMessage)
        setToastMessage(stockMessage)
        setStockBlockedItemId(details[1] ?? '')
        setUnavailableItemId(details[0] === 'UNAVAILABLE' ? details[1] : '')
        setStockAvailableQuantity(details[0] === 'INSUFFICIENT' ? Number(details[3]) : 0)
        setRequestError('')
      } else setRequestError(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTrackRequest(event) {
    event.preventDefault()
    if (!supabase || tracking) return

    const normalizedCode = trackCode.trim().toUpperCase()
    if (!/^\d{2}-\d{3,}$/.test(normalizedCode)) {
      setTrackedRequest(null)
      setShowTrackedReceipt(false)
      setTrackingError('Enter the request ID in the format 09-001.')
      return
    }

    setTracking(true)
    setTrackingError('')
    setTrackedRequest(null)
    setShowTrackedReceipt(false)
    try {
      const { data, error } = await supabase.rpc('track_supply_request', {
        p_reference_code: normalizedCode,
      })
      if (error) {
        setTrackingError('Could not check this request. Please try again.')
        return
      }

      const result = Array.isArray(data) ? data[0] : data
      if (!result) {
        setTrackingError('No request was found with that ID. Check the number and try again.')
        return
      }

      setTrackedRequest(result)
      window.history.replaceState({}, '', `/request?mode=track&id=${encodeURIComponent(normalizedCode)}`)
    } catch {
      setTrackingError('Could not check this request. Please try again.')
    } finally {
      setTracking(false)
    }
  }

  async function copyReference() {
    if (!trackedRequest?.reference_code) return
    try {
      await navigator.clipboard.writeText(trackedRequest.reference_code)
      setCopyMessage('Copied')
    } catch {
      setCopyMessage('Select and copy the ID')
    }
  }

  if (!supabase) {
    return (
      <main className="requestor-app">
        <header className="requestor-topbar"><BrandLockup /><span>SUPPLY REQUEST</span></header>
        <section className="requestor-message-panel"><h1>Request form unavailable</h1><p>The supply request system is not configured yet.</p></section>
      </main>
    )
  }

  return (
    <main className="requestor-app">
      {toastMessage && (
        <div className="request-stock-toast" role="alert">
          <div><strong>Stock issue</strong><span>{toastMessage}</span></div>
          <button type="button" aria-label="Dismiss stock alert" onClick={() => setToastMessage('')}>Dismiss</button>
        </div>
      )}
      <header className="requestor-topbar">
        <BrandLockup />
        <span className="requestor-topbar-label">SUPPLY REQUEST</span>
      </header>

      <div className="requestor-content">
        <div className="requestor-title">
          <p className="eyebrow">PRIMETECH OIL, INC.</p>
          <h1>OFFICE SUPPLIES REQUISITION FORM</h1>
          <p>Choose the items you need and submit your request for review.</p>
        </div>

        <div className="requestor-mode" role="tablist" aria-label="Request options">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'request'}
            onClick={() => {
              setView('request')
              setTrackedRequest(null)
              setTrackingError('')
              window.history.replaceState({}, '', '/request')
            }}
          >New request</button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'track'}
            onClick={() => {
              setView('track')
              setRequestError('')
              window.history.replaceState({}, '', '/request?mode=track')
            }}
          >Track a request</button>
        </div>

        {view === 'request' ? (
          <form className="public-request-form" onSubmit={handleSubmitRequest}>
            <section className="request-section" aria-labelledby="requestor-details-title">
              <div className="request-section-heading">
                <span>01</span>
                <div><h2 id="requestor-details-title">Your details</h2><p>No account required</p></div>
              </div>
              <div className="requestor-fields">
                <div>
                  <label htmlFor="requestor-name">Full name</label>
                  <input
                    id="requestor-name"
                    value={requestorName}
                    onChange={(event) => setRequestorName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    minLength="2"
                    maxLength="120"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="requestor-department">Department</label>
                  <select
                    id="requestor-department"
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    required
                    disabled={departments.length === 0}
                  >
                    <option value="">Select your department</option>
                    {departments.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
                  </select>
                  {departmentError && <p className="request-error" role="alert">{departmentError}</p>}
                </div>
              </div>
              <div className="request-search-block">
                <div className="request-section-heading">
                  <span>02</span>
                  <div><h2>Choose supplies</h2><p>Search by item, category, description, or details like brand and color.</p></div>
                </div>
                <div className="catalog-search-form">
                  <label className="sr-only" htmlFor="catalog-search">Search supplies</label>
                  <input
                    id="catalog-search"
                    type="search"
                    value={catalogSearch}
                    onChange={(event) => {
                      setCatalogSearch(event.target.value)
                      setCatalogLoading(true)
                      setCatalogError('')
                    }}
                    placeholder="Try ballpen, Pilot, blue..."
                  />
                </div>
                {catalogError && <p className="request-error" role="alert">{catalogError}</p>}
                <div className="request-catalog" aria-live="polite">
                  {catalogLoading ? <p className="request-empty">Loading supplies...</p> : catalog.length ? catalog.map((item) => (
                    <article className="request-catalog-item" key={item.id}>
                      <div>
                        <h3>{item.name}</h3>
                        <span>{item.category} · {item.unit} · <strong className="catalog-stock-count">Available: {item.quantity}</strong></span>
                        {item.description && <p>{item.description}</p>}
                        {item.attributes?.length > 0 && (
                          <p className="catalog-attribute-summary">
                            {item.attributes.map((attribute) => `${attribute.name}${attribute.values?.length ? `: ${attribute.values.join(', ')}` : ''}`).join(' · ')}
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={() => addItem(item)}>Add</button>
                    </article>
                  )) : <p className="request-empty">No available supplies match your search.</p>}
                </div>
              </div>
            </section>

            <section className="request-section request-cart-section" aria-labelledby="request-cart-title">
              <div className="request-section-heading">
                <span>03</span>
                <div><h2 id="request-cart-title">Your request <span className="cart-count">{cart.length}</span></h2><p>Set a quantity and any item details requested.</p></div>
              </div>
              {cart.length ? (
                <div className="request-cart-list">
                  {cart.map((line) => (
                    <article className="request-cart-item" key={line.lineId}>
                      <div className="request-cart-item-header">
                        <div><h3>{line.item.name}</h3><span>{line.item.category} · {line.item.unit}</span></div>
                        <button className="remove-request-item" type="button" onClick={() => {
                          const remainingCart = cart.filter((entry) => entry.lineId !== line.lineId)
                          setCart(remainingCart)
                          updateStockBlockForCart(remainingCart)
                        }}>Remove</button>
                      </div>
                      <div className="request-line-fields">
                        <div className="request-quantity-field">
                          <label htmlFor={`quantity-${line.lineId}`}>Quantity</label>
                          <input
                            id={`quantity-${line.lineId}`}
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            value={line.quantity}
                            disabled={unavailableItemId === line.item.id}
                            onChange={(event) => updateLine(line.lineId, { quantity: event.target.value })}
                            required
                          />
                        </div>
                        {line.item.attributes?.map((attribute) => {
                          const inputId = `request-attribute-${line.lineId}-${attribute.id}`
                          const listId = `${inputId}-options`
                          return (
                            <div className="request-attribute-field" key={attribute.id}>
                              <label htmlFor={inputId}>{attribute.name}{attribute.required ? ' *' : ''}</label>
                              <input
                                id={inputId}
                                list={listId}
                                value={line.attributes[attribute.id] ?? ''}
                                onChange={(event) => updateLineAttribute(line.lineId, attribute.id, event.target.value)}
                                placeholder={attribute.required ? 'Required' : 'Optional'}
                                required={attribute.required}
                                maxLength="120"
                              />
                              {attribute.values?.length > 0 && (
                                <datalist id={listId}>
                                  {attribute.values.map((value) => <option key={value} value={value} />)}
                                </datalist>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="request-cart-empty">Your request is empty. Add items from the catalog above.</p>}

              <div className="request-remarks-field">
                <label htmlFor="request-remarks">Remarks <span>Optional</span></label>
                <textarea
                  id="request-remarks"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Add a note for the approver"
                  maxLength="1000"
                  rows="3"
                />
              </div>

              {requestError && <p className="request-error" role="alert">{requestError}</p>}
              {stockIssue && (
                <p className="stock-issue" role="status">
                  {unavailableItemId === stockBlockedItemId
                    ? `Remove ${cart.find((line) => line.item.id === stockBlockedItemId)?.item.name ?? 'the unavailable item'} to continue.`
                    : stockAvailableQuantity !== null
                      ? `Adjust the total quantity for ${cart.find((line) => line.item.id === stockBlockedItemId)?.item.name ?? 'this item'} to ${stockAvailableQuantity} or fewer before submitting.`
                      : 'Resolve the stock issue before submitting.'}
                </p>
              )}
              <button className="request-submit-button" type="submit" disabled={submitting || catalogLoading || Boolean(stockIssue)}>
                {submitting ? 'Submitting request...' : 'Submit request'} <span aria-hidden="true">&gt;</span>
              </button>
              <p className="request-submit-note">Your request will be sent for approval. Keep the request ID to check its status.</p>
            </section>
          </form>
        ) : (
          <section className="tracking-panel" aria-labelledby="tracking-title">
            <div className="request-section-heading">
              <span>01</span>
              <div><h2 id="tracking-title">Track your request</h2><p>Enter the ID shown after you submitted your request.</p></div>
            </div>
            <form className="tracking-form" onSubmit={handleTrackRequest}>
              <label htmlFor="request-reference">Request ID</label>
              <div className="tracking-input-row">
                <input
                  id="request-reference"
                  value={trackCode}
                  onChange={(event) => setTrackCode(event.target.value.toUpperCase())}
                  placeholder="09-001"
                  autoCapitalize="characters"
                  required
                />
                <button type="submit" disabled={tracking}>{tracking ? 'Checking...' : 'Check status'}</button>
              </div>
              {trackingError && <p className="request-error" role="alert">{trackingError}</p>}
            </form>

            {trackedRequest && (
              <div className="request-status-result" aria-live="polite">
                <div className="request-reference-display">
                  <div><span>REQUEST ID</span><strong>{trackedRequest.reference_code}</strong></div>
                  {trackedRequest.created_at && <time dateTime={trackedRequest.created_at}>{formatDate(trackedRequest.created_at)}</time>}
                </div>
                <div className="request-current-status">
                  <span className={`request-status-dot status-${trackedRequest.status.toLowerCase()}`} />
                  <div><span>CURRENT STATUS</span><strong>{trackedRequest.status}</strong></div>
                </div>
                {trackedRequest.status === 'REJECTED' && trackedRequest.rejection_reason && (
                  <div className="request-rejection-note">
                    <span>REJECTION REASON</span>
                    <p>{trackedRequest.rejection_reason}</p>
                  </div>
                )}
                {trackedRequest.reference_code && (
                  <button className="copy-reference-button" type="button" onClick={copyReference}>
                    {copyMessage || 'Copy request ID'}
                  </button>
                )}
                {trackedRequest.status === 'RECEIVED' && trackedRequest.items?.length > 0 && (
                  <button className="copy-reference-button tracked-receipt-button" type="button" onClick={() => setShowTrackedReceipt(true)}>
                    View / print release receipt
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {showTrackedReceipt && trackedRequest?.status === 'RECEIVED' && (
        <ReleaseReceipt request={trackedRequest} onClose={() => setShowTrackedReceipt(false)} />
      )}
      <footer className="requestor-footer"><span>SUPPLY OPERATIONS</span><span>REQUESTS ARE SUBJECT TO APPROVAL</span></footer>
    </main>
  )
}

export default RequestorPortal
