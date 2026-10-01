import { useEffect, useState } from 'react'
import BrandLockup from './BrandLockup'

function formatDate(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

function ReceiverDashboard({ supabase, email, onSignOut, signingOut }) {
  const [dashboard, setDashboard] = useState({ approved_count: 0, received_count: 0, requests: [] })
  const [loading, setLoading] = useState(true)
  const [busyRequestId, setBusyRequestId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [receiptRequestId, setReceiptRequestId] = useState(null)

  async function loadDashboard() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_receiver_dashboard')
    if (error) {
      setErrorMessage(error.message || 'Could not load approved requests.')
      setLoading(false)
      return false
    }
    setDashboard(data ?? { approved_count: 0, received_count: 0, requests: [] })
    setErrorMessage('')
    setLoading(false)
    return true
  }

  useEffect(() => {
    let active = true
    supabase.rpc('get_receiver_dashboard').then(({ data, error }) => {
      if (!active) return
      if (error) setErrorMessage(error.message || 'Could not load approved requests.')
      else setDashboard(data ?? { approved_count: 0, received_count: 0, requests: [] })
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setErrorMessage('Could not reach the request service.')
      setLoading(false)
    })
    return () => { active = false }
  }, [supabase])

  async function markReceived(request) {
    if (!window.confirm(`Confirm that supplies for ${request.reference_code} have been released and received?`)) return

    setBusyRequestId(request.id)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { error } = await supabase.rpc('mark_supply_request_received', {
        p_request_id: request.id,
      })
      if (error) throw error
      setSuccessMessage(`${request.reference_code} marked as received.`)
      if (await loadDashboard()) setReceiptRequestId(request.id)
    } catch (error) {
      setErrorMessage(error.message || 'Could not update this request.')
    } finally {
      setBusyRequestId(null)
    }
  }

  const approvedRequests = dashboard.requests.filter((request) => request.status === 'APPROVED')
  const receivedRequests = dashboard.requests.filter((request) => request.status === 'RECEIVED')
  const receiptRequest = dashboard.requests.find((request) => request.id === receiptRequestId)
  const receiverInitials = (email || 'R')
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <section className="role-dashboard" aria-label="Receiver workspace">
      <aside className="role-sidebar approver-sidebar receiver-sidebar">
        <div className="sidebar-brand">
          <BrandLockup />
          <span className="approver-sidebar-caption">SUPPLY OPERATIONS</span>
        </div>
        <div className="approver-sidebar-section">
          <span className="approver-sidebar-kicker">WORKSPACE</span>
          <p className="sidebar-section-label">SUPPLY HANDOFF</p>
        </div>
        <nav className="role-nav" aria-label="Receiver navigation">
          <span className="role-nav-item" aria-current="page">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 7l2-4h14l2 4M8 11h8M8 15h5" /></svg>
            <span className="approver-nav-label">Supply handoff</span>
            <span className="approver-nav-count">{dashboard.approved_count}</span>
          </span>
        </nav>
        <div className="approver-sidebar-summary">
          <span className="approver-summary-icon" aria-hidden="true">↗</span>
          <div><strong>{dashboard.approved_count} ready for release</strong><span>Confirm each handoff after supplies are issued.</span></div>
        </div>
        <div className="approver-sidebar-profile">
          <span className="approver-avatar" aria-hidden="true">{receiverInitials || 'R'}</span>
          <span className="approver-profile-copy"><strong>Receiver</strong><small>{email}</small></span>
          <span className="approver-profile-status" title="Signed in" aria-label="Signed in" />
        </div>
        <div className="sidebar-footer"><span className="status-dot" />RECEIVER ACCESS</div>
      </aside>

      <div className="role-main">
        <header className="role-topline">
          <span>Supply handoff</span>
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
              <p className="eyebrow">RECEIVER / OVERVIEW</p>
              <h1>Approved supplies</h1>
              <p>Confirm a request after releasing the supplies; confirmation deducts them from inventory.</p>
            </div>
            <button className="refresh-button" type="button" onClick={loadDashboard} disabled={loading}>Refresh</button>
          </div>

          {errorMessage && <p className="inventory-message error-message" role="alert">{errorMessage}</p>}
          {successMessage && <p className="inventory-message success-message" role="status">{successMessage}</p>}

          <section className="receiver-metrics" aria-label="Handoff metrics">
            <div className="approver-metric metric-pending"><span>READY FOR RELEASE</span><strong>{dashboard.approved_count}</strong></div>
            <div className="approver-metric"><span>RECEIVED</span><strong>{dashboard.received_count}</strong></div>
          </section>

          <section className="approver-queue" aria-labelledby="receiver-queue-title">
            <div className="approver-queue-heading">
              <div className="section-heading"><p className="eyebrow">APPROVED BY ADMIN</p><h2 id="receiver-queue-title">Ready for release <span>{approvedRequests.length}</span></h2></div>
            </div>
            {loading ? <p className="approver-muted queue-empty">Loading approved requests...</p> : approvedRequests.length ? (
              <div className="pending-request-list">
                {approvedRequests.map((request) => (
                  <article className="pending-request-card" key={request.id}>
                    <header className="pending-request-header">
                      <div><span className="pending-reference">{request.reference_code}</span><time dateTime={request.created_at}>{formatDate(request.created_at)}</time></div>
                      <span className="request-status-label approved-label">APPROVED</span>
                    </header>
                    <div className="pending-request-details">
                      <div><span>REQUESTOR</span><strong>{request.requestor_name}</strong></div>
                      <div><span>DEPARTMENT</span><strong>{request.department}</strong></div>
                    </div>
                    <div className="pending-request-items">
                      {request.items.map((item, index) => (
                        <div className="pending-item-row" key={`${request.id}-${index}`}>
                          <div><strong>{item.name}</strong><span>{item.attributes?.map((attribute) => `${attribute.name}: ${attribute.value || 'Not specified'}`).join(' · ')}</span></div>
                          <span>{item.quantity} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                    <footer className="pending-request-actions receiver-request-actions">
                      <button type="button" className="cancel-button" onClick={() => setReceiptRequestId(request.id)}>
                        Print release receipt
                      </button>
                      <button type="button" className="approve-button" disabled={busyRequestId === request.id} onClick={() => markReceived(request)}>
                        {busyRequestId === request.id ? 'Saving...' : 'Confirm release & deduct stock'}
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : <p className="approver-muted queue-empty">No approved requests are waiting for release.</p>}
          </section>

          <section className="approver-queue received-queue" aria-labelledby="received-queue-title">
            <div className="approver-queue-heading">
              <div className="section-heading"><p className="eyebrow">COMPLETED HANDOFFS</p><h2 id="received-queue-title">Received <span>{receivedRequests.length}</span></h2></div>
            </div>
            {receivedRequests.length ? receivedRequests.map((request) => (
              <div className="received-request-row" key={request.id}>
                <div><strong>{request.reference_code}</strong><span>{request.requestor_name} · {request.department}</span></div>
                <div className="received-request-actions">
                  <span>RECEIVED</span>
                  <button className="refresh-button" type="button" onClick={() => setReceiptRequestId(request.id)}>Print receipt</button>
                </div>
              </div>
            )) : <p className="approver-muted queue-empty">Completed requests will be listed here.</p>}
          </section>
        </main>

        <footer className="page-footer"><span>SUPPLY OPERATIONS</span><span>AUTHORIZED PERSONNEL ONLY</span></footer>
      </div>
      {receiptRequest && (
        <div className="release-receipt-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReceiptRequestId(null)
        }}>
          <section className="release-receipt" role="dialog" aria-modal="true" aria-labelledby="release-receipt-title">
            <header className="release-receipt-header">
              <div className="release-receipt-letterhead">
                <img src="/Picture1.png" alt="Primetech Oil, Inc. letterhead with Head Office and Baliwag Plant contact information" />
              </div>
              <button className="release-receipt-close" type="button" onClick={() => setReceiptRequestId(null)} aria-label="Close receipt">×</button>
            </header>
            <div className="release-receipt-titlebar">
              <h2 id="release-receipt-title">Office Supplies Release Receipt</h2>
            </div>
            <div className="release-receipt-meta">
              <div><span>CONTROL NO.</span><strong>{receiptRequest.reference_code}</strong></div>
              <div><span>REQUEST DATE</span><strong>{formatDate(receiptRequest.created_at)}</strong></div>
              <div><span>DEPARTMENT</span><strong>{receiptRequest.department}</strong></div>
              <div><span>REQUESTOR</span><strong>{receiptRequest.requestor_name}</strong></div>
              <div><span>APPROVAL DATE</span><strong>{receiptRequest.reviewed_at ? formatDate(receiptRequest.reviewed_at) : 'Pending approval'}</strong></div>
              <div><span>RELEASE DATE</span><strong>{receiptRequest.received_at ? formatDate(receiptRequest.received_at) : 'To be completed at handoff'}</strong></div>
            </div>
            {receiptRequest.remarks && (
              <p className="release-receipt-remarks"><strong>Purpose / remarks:</strong> {receiptRequest.remarks}</p>
            )}
            <table className="release-receipt-items">
              <thead>
                <tr><th>Item / specification</th><th>Unit</th><th>Qty approved</th><th>Qty released</th></tr>
              </thead>
              <tbody>
                {receiptRequest.items.map((item, index) => (
                  <tr key={`${receiptRequest.id}-receipt-${index}`}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.attributes?.length > 0 && (
                        <small>{item.attributes.map((attribute) => `${attribute.name}: ${attribute.value || 'Not specified'}`).join(' · ')}</small>
                      )}
                    </td>
                    <td>{item.unit}</td>
                    <td>{item.quantity}</td>
                    <td>{receiptRequest.status === 'RECEIVED' ? item.quantity : '________'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="release-receipt-certification">I acknowledge receipt of the supplies and quantities recorded above.</p>
            <div className="release-receipt-signatures">
              <div><strong>{receiptRequest.requestor_name}</strong><span>Requestor signature</span><span>Date: ____________________</span></div>
              <div><strong>{receiptRequest.approver_name || ' '}</strong><span>Approver signature</span><span>Date: {receiptRequest.reviewed_at ? formatDate(receiptRequest.reviewed_at) : '____________________'}</span></div>
              <div><strong>{receiptRequest.receiver_name || ' '}</strong><span>Receiver signature</span><span>Date: {receiptRequest.received_at ? formatDate(receiptRequest.received_at) : '____________________'}</span></div>
            </div>
            <footer className="release-receipt-actions">
              <button className="cancel-button" type="button" onClick={() => setReceiptRequestId(null)}>Close</button>
              <button className="approve-button" type="button" onClick={() => window.print()}>Print receipt</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}

export default ReceiverDashboard
