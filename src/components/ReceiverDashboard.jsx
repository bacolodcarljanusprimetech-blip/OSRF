import { useEffect, useState } from 'react'
import BrandLockup from './BrandLockup'

function formatDate(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function ReceiverDashboard({ supabase, email, onSignOut, signingOut }) {
  const [dashboard, setDashboard] = useState({ approved_count: 0, received_count: 0, requests: [] })
  const [loading, setLoading] = useState(true)
  const [busyRequestId, setBusyRequestId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function loadDashboard() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_receiver_dashboard')
    if (error) setErrorMessage(error.message || 'Could not load approved requests.')
    else {
      setDashboard(data ?? { approved_count: 0, received_count: 0, requests: [] })
      setErrorMessage('')
    }
    setLoading(false)
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
      await loadDashboard()
    } catch (error) {
      setErrorMessage(error.message || 'Could not update this request.')
    } finally {
      setBusyRequestId(null)
    }
  }

  const approvedRequests = dashboard.requests.filter((request) => request.status === 'APPROVED')
  const receivedRequests = dashboard.requests.filter((request) => request.status === 'RECEIVED')

  return (
    <section className="role-dashboard" aria-label="Receiver workspace">
      <aside className="role-sidebar">
        <div className="sidebar-brand"><BrandLockup /></div>
        <p className="sidebar-section-label">RECEIVER MODULES</p>
        <nav className="role-nav" aria-label="Receiver navigation">
          <span className="role-nav-item" aria-current="page">Supply handoff</span>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />RECEIVER</div>
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
              <p>Review approved requests and confirm once supplies have been released.</p>
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
                      <button type="button" className="approve-button" disabled={busyRequestId === request.id} onClick={() => markReceived(request)}>
                        {busyRequestId === request.id ? 'Saving...' : 'Confirm supplies received'}
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
                <span>RECEIVED</span>
              </div>
            )) : <p className="approver-muted queue-empty">Completed requests will be listed here.</p>}
          </section>
        </main>

        <footer className="page-footer"><span>SUPPLY OPERATIONS</span><span>AUTHORIZED PERSONNEL ONLY</span></footer>
      </div>
    </section>
  )
}

export default ReceiverDashboard
