function formatDate(value) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

function ReleaseReceipt({ request, onClose }) {
  return (
    <div className="release-receipt-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="release-receipt" role="dialog" aria-modal="true" aria-labelledby="release-receipt-title">
        <header className="release-receipt-header">
          <div className="release-receipt-letterhead">
            <img src="/Picture1.png" alt="Primetech Oil, Inc. letterhead with Head Office and Baliwag Plant contact information" />
          </div>
          <button className="release-receipt-close" type="button" onClick={onClose} aria-label="Close receipt">×</button>
        </header>
        <div className="release-receipt-titlebar">
          <h2 id="release-receipt-title">Office Supplies Release Receipt</h2>
        </div>
        <div className="release-receipt-meta">
          <div><span>CONTROL NO.</span><strong>{request.reference_code}</strong></div>
          <div><span>REQUEST DATE</span><strong>{formatDate(request.created_at)}</strong></div>
          <div><span>DEPARTMENT</span><strong>{request.department}</strong></div>
          <div><span>REQUESTOR</span><strong>{request.requestor_name}</strong></div>
          <div><span>APPROVAL DATE</span><strong>{request.reviewed_at ? formatDate(request.reviewed_at) : 'Pending approval'}</strong></div>
          <div><span>RELEASE DATE</span><strong>{request.received_at ? formatDate(request.received_at) : 'To be completed at handoff'}</strong></div>
        </div>
        {request.remarks && (
          <p className="release-receipt-remarks"><strong>Purpose / remarks:</strong> {request.remarks}</p>
        )}
        <table className="release-receipt-items">
          <thead>
            <tr><th>Item / specification</th><th>Unit</th><th>Qty approved</th><th>Qty released</th></tr>
          </thead>
          <tbody>
            {request.items.map((item, index) => (
              <tr key={`${request.reference_code}-receipt-${index}`}>
                <td>
                  <strong>{item.name}</strong>
                  {item.attributes?.length > 0 && (
                    <small>{item.attributes.map((attribute) => `${attribute.name}: ${attribute.value || 'Not specified'}`).join(' · ')}</small>
                  )}
                </td>
                <td>{item.unit}</td>
                <td>{item.quantity}</td>
                <td>{request.status === 'RECEIVED' ? item.quantity : '________'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="release-receipt-certification">I acknowledge receipt of the supplies and quantities recorded above.</p>
        <div className="release-receipt-signatures">
          <div><strong>{request.requestor_name}</strong><span>Request by:</span><span>Date: ____________________</span></div>
          <div><strong>{request.approver_name || ' '}</strong><span>Approved by:</span><span>Date: {request.reviewed_at ? formatDate(request.reviewed_at) : '____________________'}</span></div>
          <div><strong>{request.receiver_name || ' '}</strong><span>Released by:</span><span>Date: {request.received_at ? formatDate(request.received_at) : '____________________'}</span></div>
        </div>
        <footer className="release-receipt-actions">
          <button className="cancel-button" type="button" onClick={onClose}>Close</button>
          <button className="approve-button" type="button" onClick={() => window.print()}>Print receipt</button>
        </footer>
      </section>
    </div>
  )
}

export default ReleaseReceipt
