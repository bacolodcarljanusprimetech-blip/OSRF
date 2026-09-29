import BrandLockup from './BrandLockup'

function RoleDashboard({ role, email, onSignOut, signingOut }) {
  const isApprover = role === 'APPROVER'
  const roleName = isApprover ? 'Approver' : 'Receiver'
  const queueTitle = isApprover ? 'Pending requests' : 'Approved requests'
  const emptyMessage = isApprover
    ? 'Requests awaiting review will appear here.'
    : 'Approved requests awaiting release will appear here.'

  return (
    <section className="role-dashboard" aria-label={`${roleName} workspace`}>
      <aside className="role-sidebar">
        <div className="sidebar-brand"><BrandLockup /></div>
        <p className="sidebar-section-label">{roleName.toUpperCase()} MODULES</p>
        <nav className="role-nav" aria-label={`${roleName} navigation`}>
          <span className="role-nav-item" aria-current="page">Overview</span>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />{roleName.toUpperCase()}</div>
      </aside>

      <div className="role-main">
        <header className="role-topline">
          <span>{roleName} dashboard</span>
          <div className="inventory-account">
            <span className="account-email">{email}</span>
            <button className="sign-out-button" type="button" onClick={onSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </header>

        <main className="role-content">
          <p className="eyebrow">{roleName.toUpperCase()} / OVERVIEW</p>
          <h1>{roleName} dashboard</h1>
          <p className="role-intro">{isApprover ? 'Review supply requests submitted by employees.' : 'Prepare approved supply requests for release.'}</p>

          <section className="role-queue" aria-labelledby="role-queue-title">
            <div className="role-queue-heading">
              <div>
                <p className="eyebrow">WORK QUEUE</p>
                <h2 id="role-queue-title">{queueTitle}</h2>
              </div>
              <strong>0</strong>
            </div>
            <div className="role-empty-state">
              <span className="role-empty-rule" aria-hidden="true" />
              <p>{emptyMessage}</p>
            </div>
          </section>
        </main>

        <footer className="page-footer"><span>SUPPLY OPERATIONS</span><span>AUTHORIZED PERSONNEL ONLY</span></footer>
      </div>
    </section>
  )
}

export default RoleDashboard
