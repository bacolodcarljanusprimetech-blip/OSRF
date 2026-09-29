import { useEffect, useState } from 'react'
import BrandLockup from './BrandLockup'

const emptyMetrics = {
  total_requests: 0,
  pending_requests: 0,
  approved_requests: 0,
  rejected_requests: 0,
  received_requests: 0,
  requests_today: 0,
  unique_requestors: 0,
  units_requested: 0,
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function ApproverDashboard({ supabase, email, onSignOut, signingOut }) {
  const emptyDashboard = { metrics: emptyMetrics, departments: [], top_requestors: [], top_items: [], pending_queue: [], review_history: [] }
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [loading, setLoading] = useState(true)
  const [activeModule, setActiveModule] = useState('pending')
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [busyRequestId, setBusyRequestId] = useState(null)

  async function loadDashboard() {
    setLoading(true)
    setErrorMessage('')
    const { data, error } = await supabase.rpc('get_approver_dashboard')
    if (error) setErrorMessage(error.message || 'Could not load requests.')
    else setDashboard(data ?? emptyDashboard)
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    supabase.rpc('get_approver_dashboard').then(({ data, error }) => {
      if (!active) return
      if (error) setErrorMessage(error.message || 'Could not load requests.')
      else setDashboard(data ?? emptyDashboard)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setErrorMessage('Could not reach the request service.')
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedRequest) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setSelectedRequest(null)
        setRejecting(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedRequest])

  async function reviewRequest(request, decision) {
    if (decision === 'APPROVED' && !window.confirm(`Approve ${request.reference_code} and pass it to the Receiver queue?`)) return
    if (decision === 'REJECTED' && rejectionReason.trim().length < 3) {
      setErrorMessage('Enter a rejection reason of at least 3 characters.')
      return
    }

    setBusyRequestId(request.id)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data, error } = await supabase.rpc('review_supply_request', {
        p_request_id: request.id,
        p_decision: decision,
        p_rejection_reason: decision === 'REJECTED' ? rejectionReason.trim() : null,
      })
      if (error) throw error
      const referenceCode = Array.isArray(data) ? data[0] : data
      setSuccessMessage(decision === 'APPROVED'
        ? `${referenceCode} approved and sent to the Receiver queue.`
        : `${referenceCode} rejected.`)
      setSelectedRequest(null)
      setRejecting(false)
      setRejectionReason('')
      await loadDashboard()
    } catch (error) {
      setErrorMessage(error.message || 'This request could not be reviewed.')
    } finally {
      setBusyRequestId(null)
    }
  }

  const metrics = dashboard.metrics ?? emptyMetrics
  const searchText = search.trim().toLowerCase()
  const matchesFilters = (request) => {
    const searchable = [
      request.reference_code,
      request.requestor_name,
      request.department,
      ...(request.items ?? []).map((item) => `${item.name} ${(item.attributes ?? []).map((attribute) => `${attribute.name} ${attribute.value}`).join(' ')}`),
    ].join(' ').toLowerCase()
    return (departmentFilter === 'ALL' || request.department === departmentFilter)
      && (!searchText || searchable.includes(searchText))
  }
  const pendingRequests = (dashboard.pending_queue ?? []).filter(matchesFilters)
  const reviewHistory = (dashboard.review_history ?? []).filter((request) =>
    (statusFilter === 'ALL' || request.status === statusFilter) && matchesFilters(request),
  )
  const selectedStatus = selectedRequest?.status ?? 'PENDING'
  const departmentOptions = [...new Set([
    ...(dashboard.departments ?? []).map((entry) => entry.department),
    ...(dashboard.pending_queue ?? []).map((request) => request.department),
    ...(dashboard.review_history ?? []).map((request) => request.department),
  ])].sort((first, second) => first.localeCompare(second))

  return (
    <section className="role-dashboard" aria-label="Approver workspace">
      <aside className="role-sidebar">
        <div className="sidebar-brand"><BrandLockup /></div>
        <p className="sidebar-section-label">APPROVER MODULES</p>
        <nav className="role-nav" aria-label="Approver navigation">
          <button className="role-nav-item" type="button" aria-current={activeModule === 'pending' ? 'page' : undefined} onClick={() => setActiveModule('pending')}>
            Pending requests <span>{metrics.pending_requests}</span>
          </button>
          <button className="role-nav-item" type="button" aria-current={activeModule === 'history' ? 'page' : undefined} onClick={() => setActiveModule('history')}>
            Review history
          </button>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />APPROVER</div>
      </aside>

      <div className="role-main">
        <header className="role-topline">
          <span>{activeModule === 'pending' ? 'Pending requests' : 'Review history'}</span>
          <div className="inventory-account">
            <span className="account-email">{email}</span>
            <button className="sign-out-button" type="button" onClick={onSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </header>

        <main className="approver-content">
          <div className="approver-heading">
            <div>
              <p className="eyebrow">APPROVER / {activeModule === 'pending' ? 'PENDING REQUESTS' : 'REVIEW HISTORY'}</p>
              <h1>{activeModule === 'pending' ? 'Request review' : 'Review history'}</h1>
              <p>{activeModule === 'pending' ? 'Review employee supply requests and route approved requests to the Receiver.' : 'Search and filter completed request decisions and handoffs.'}</p>
            </div>
            <button className="refresh-button" type="button" onClick={loadDashboard} disabled={loading}>Refresh</button>
          </div>

          {errorMessage && <p className="inventory-message error-message" role="alert">{errorMessage}</p>}
          {successMessage && <p className="inventory-message success-message" role="status">{successMessage}</p>}

          <section className="approver-metrics" aria-label="Request metrics">
            <div className="approver-metric metric-pending"><span>PENDING REVIEW</span><strong>{metrics.pending_requests}</strong></div>
            <div className="approver-metric"><span>REQUESTS TODAY</span><strong>{metrics.requests_today}</strong></div>
            <div className="approver-metric"><span>TOTAL REQUESTS</span><strong>{metrics.total_requests}</strong></div>
            <div className="approver-metric"><span>UNITS REQUESTED</span><strong>{metrics.units_requested}</strong></div>
            <div className="approver-metric"><span>UNIQUE REQUESTORS</span><strong>{metrics.unique_requestors}</strong></div>
            <div className="approver-metric"><span>APPROVED / REJECTED</span><strong>{metrics.approved_requests} / {metrics.rejected_requests}</strong></div>
          </section>

          <div className="approver-insights">
            <section className="approver-insight-panel" aria-labelledby="department-metrics-title">
              <div className="section-heading"><p className="eyebrow">REQUEST VOLUME</p><h2 id="department-metrics-title">By department</h2></div>
              {dashboard.departments.length ? dashboard.departments.map((entry) => (
                <div className="insight-row" key={entry.department}><span>{entry.department}</span><strong>{entry.request_count}</strong></div>
              )) : <p className="approver-muted">Department metrics will appear as requests arrive.</p>}
            </section>
            <section className="approver-insight-panel" aria-labelledby="requestor-metrics-title">
              <div className="section-heading"><p className="eyebrow">REPEAT REQUESTORS</p><h2 id="requestor-metrics-title">Most requests</h2></div>
              {dashboard.top_requestors.length ? dashboard.top_requestors.map((entry) => (
                <div className="insight-row" key={`${entry.name}-${entry.department}`}><span>{entry.name}<small>{entry.department}</small></span><strong>{entry.request_count}</strong></div>
              )) : <p className="approver-muted">Requestor metrics will appear as requests arrive.</p>}
            </section>
            <section className="approver-insight-panel" aria-labelledby="item-metrics-title">
              <div className="section-heading"><p className="eyebrow">SUPPLY DEMAND</p><h2 id="item-metrics-title">Most requested items</h2></div>
              {dashboard.top_items.length ? dashboard.top_items.map((entry) => (
                <div className="insight-row" key={entry.name}><span>{entry.name}<small>{entry.request_count} request lines</small></span><strong>{entry.quantity}</strong></div>
              )) : <p className="approver-muted">Item metrics will appear as requests arrive.</p>}
            </section>
          </div>

          {activeModule === 'pending' ? (
            <section className="approver-queue" aria-labelledby="pending-queue-title">
              <div className="approver-queue-heading">
                <div className="section-heading"><p className="eyebrow">ACTION REQUIRED</p><h2 id="pending-queue-title">Pending requests <span>{pendingRequests.length}</span></h2></div>
              </div>
              <div className="approver-filters">
                <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Request ID, requestor, item..." /></label>
                <label><span>Department</span><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="ALL">All departments</option>{departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
              </div>
              {loading ? <p className="approver-muted queue-empty">Loading requests...</p> : pendingRequests.length ? (
                <div className="pending-request-list">
                  {pendingRequests.map((request) => (
                    <article className="pending-request-card pending-request-summary" key={request.id}>
                      <header className="pending-request-header">
                        <div><span className="pending-reference">{request.reference_code}</span><time dateTime={request.created_at}>{formatDate(request.created_at)}</time></div>
                        <span className="request-status-label">PENDING</span>
                      </header>
                      <div className="pending-request-details">
                        <div><span>REQUESTOR</span><strong>{request.requestor_name}</strong></div>
                        <div><span>DEPARTMENT</span><strong>{request.department}</strong></div>
                      </div>
                      <div className="summary-request-footer">
                        <span>{request.items.length} {request.items.length === 1 ? 'item' : 'items'}</span>
                        <button type="button" onClick={() => { setSelectedRequest(request); setRejecting(false); setRejectionReason('') }}>View details</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="approver-muted queue-empty">{search || departmentFilter !== 'ALL' ? 'No pending requests match these filters.' : 'No pending requests. New submissions will appear here.'}</p>}
            </section>
          ) : (
            <section className="approver-queue" aria-labelledby="review-history-title">
              <div className="approver-queue-heading">
                <div className="section-heading"><p className="eyebrow">DECISIONS & HANDOFFS</p><h2 id="review-history-title">Review history <span>{reviewHistory.length}</span></h2></div>
              </div>
              <div className="approver-filters history-filters">
                <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Request ID, requestor, item..." /></label>
                <label><span>Department</span><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="ALL">All departments</option>{departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
                <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All decisions</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="RECEIVED">Received</option></select></label>
              </div>
              {loading ? <p className="approver-muted queue-empty">Loading history...</p> : reviewHistory.length ? (
                <div className="history-list">
                  {reviewHistory.map((request) => (
                    <article className="history-row" key={request.id}>
                      <div className="history-reference"><strong>{request.reference_code}</strong><span>{formatDate(request.reviewed_at ?? request.created_at)}</span></div>
                      <div className="history-requestor"><strong>{request.requestor_name}</strong><span>{request.department}</span></div>
                      <span className={`history-status status-${request.status.toLowerCase()}`}>{request.status}</span>
                      <button type="button" onClick={() => { setSelectedRequest(request); setRejecting(false); setRejectionReason('') }}>View details</button>
                    </article>
                  ))}
                </div>
              ) : <p className="approver-muted queue-empty">No reviewed requests match these filters.</p>}
            </section>
          )}

          {selectedRequest && (
            <div className="request-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRequest(null) }}>
              <section className="request-details-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
                <header className="request-modal-header">
                  <div><p className="eyebrow">REQUEST DETAILS</p><h2 id="request-modal-title">{selectedRequest.reference_code}</h2></div>
                  <button type="button" className="modal-close-button" aria-label="Close request details" onClick={() => { setSelectedRequest(null); setRejecting(false) }}>Close</button>
                </header>
                <div className="request-modal-body">
                  <div className="modal-request-facts">
                    <div><span>REQUESTOR</span><strong>{selectedRequest.requestor_name}</strong></div>
                    <div><span>DEPARTMENT</span><strong>{selectedRequest.department}</strong></div>
                    <div><span>SUBMITTED</span><strong>{formatDate(selectedRequest.created_at)}</strong></div>
                    <div><span>STATUS</span><strong className={`history-status status-${selectedStatus.toLowerCase()}`}>{selectedStatus}</strong></div>
                    {selectedRequest.reviewed_at && <div><span>REVIEWED</span><strong>{formatDate(selectedRequest.reviewed_at)}</strong></div>}
                  </div>
                  <h3>Requested items</h3>
                  <div className="modal-items-list">
                    {selectedRequest.items.map((item, index) => (
                      <article className="modal-item" key={`${selectedRequest.id}-${index}`}>
                        <div className="modal-item-heading"><strong>{item.name}</strong><span>Requested: {item.quantity} {item.unit}</span></div>
                        <p className={`modal-item-stock ${item.is_available ? 'stock-available' : 'stock-unavailable'}`}>
                          {Number.isInteger(item.available_quantity)
                            ? `${item.is_available ? 'Available to request' : 'Not available to request'} · ${item.available_quantity} in stock`
                            : 'Current stock status unavailable'}
                        </p>
                        {item.attributes?.length > 0 && <dl>{item.attributes.map((attribute) => <div key={attribute.name}><dt>{attribute.name}</dt><dd>{attribute.value || 'Not specified'}</dd></div>)}</dl>}
                      </article>
                    ))}
                  </div>
                  <div className="modal-remarks"><span>REQUESTOR REMARKS</span><p>{selectedRequest.remarks || 'No remarks provided.'}</p></div>
                  {selectedRequest.rejection_reason && <div className="modal-rejection-reason"><span>REJECTION REASON</span><p>{selectedRequest.rejection_reason}</p></div>}
                  {rejecting && selectedStatus === 'PENDING' && (
                    <div className="rejection-form modal-rejection-form">
                      <label htmlFor="modal-rejection-reason">Reason for rejection</label>
                      <textarea id="modal-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Explain why this request cannot be approved" minLength="3" maxLength="1000" rows="3" required />
                    </div>
                  )}
                </div>
                <footer className="request-modal-actions">
                  {selectedStatus === 'PENDING' && !rejecting && <button type="button" className="reject-button" disabled={busyRequestId === selectedRequest.id} onClick={() => setRejecting(true)}>Reject</button>}
                  {selectedStatus === 'PENDING' && rejecting && <button type="button" className="cancel-button" onClick={() => { setRejecting(false); setRejectionReason('') }}>Cancel rejection</button>}
                  {selectedStatus === 'PENDING' && rejecting
                    ? <button type="button" className="reject-confirm-button" disabled={busyRequestId === selectedRequest.id} onClick={() => reviewRequest(selectedRequest, 'REJECTED')}>Confirm rejection</button>
                    : selectedStatus === 'PENDING' && <button type="button" className="approve-button" disabled={busyRequestId === selectedRequest.id} onClick={() => reviewRequest(selectedRequest, 'APPROVED')}>Approve and pass to Receiver</button>}
                </footer>
              </section>
            </div>
          )}
        </main>

        <footer className="page-footer"><span>SUPPLY OPERATIONS</span><span>AUTHORIZED PERSONNEL ONLY</span></footer>
      </div>
    </section>
  )
}

export default ApproverDashboard
