import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './services/supabase'
import BrandLockup from './components/BrandLockup'
import ApproverDashboard from './components/ApproverDashboard'
import InventoryManager from './components/InventoryManager'
import ReceiverDashboard from './components/ReceiverDashboard'
import RequestorPortal from './components/RequestorPortal'
import './App.css'

function AdminApp() {
  const requestedFlow = new URLSearchParams(window.location.search).get('flow')
  const initialPasswordFlow = ['invite', 'recovery'].includes(requestedFlow) ? requestedFlow : null
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState(isSupabaseConfigured ? 'checking' : 'setup')
  const [role, setRole] = useState(null)
  const [passwordFlow, setPasswordFlow] = useState(initialPasswordFlow)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession && (initialPasswordFlow || event === 'PASSWORD_RECOVERY')) {
        setPasswordFlow(initialPasswordFlow ?? 'recovery')
        setStatus('passwordSetup')
      }
      setSession(nextSession)
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setMessage('Your session could not be checked. Please sign in again.')
        setStatus('signedOut')
        return
      }
      setSession(data.session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [initialPasswordFlow])

  useEffect(() => {
    if (passwordFlow) {
      if (session) setStatus('passwordSetup')
      return undefined
    }

    if (!supabase || !session) {
      if (isSupabaseConfigured) setStatus('signedOut')
      return undefined
    }

    let active = true
    setStatus('checking')
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return
      if (error || !data.user) {
        setMessage('Your session has expired. Sign in to continue.')
        setStatus('signedOut')
        return
      }

      const userRole = data.user.app_metadata?.role
      const isActive = data.user.app_metadata?.is_active !== false
      if (!['ADMIN', 'APPROVER', 'RECEIVER'].includes(userRole) || !isActive) {
        setMessage('This account is inactive or does not have an assigned system role.')
        setStatus('signedOut')
        await supabase.auth.signOut()
        return
      }

      setEmail(data.user.email ?? '')
      setRole(userRole)
      setStatus('authorized')
      setMessage('')
    })

    return () => {
      active = false
    }
  }, [session, passwordFlow])

  async function handleSignIn(event) {
    event.preventDefault()
    if (!supabase || busy) return

    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    } catch {
      setMessage('Could not reach Supabase. Check the project URL and your network connection.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signOut()
    setBusy(false)
    if (error) setMessage('Sign out failed. Please try again.')
    else {
      setSession(null)
      setStatus('signedOut')
      setMessage('')
      setEmail('')
      setRole(null)
    }
  }

  async function handlePasswordSetup(event) {
    event.preventDefault()
    if (!supabase || busy) return
    if (newPassword.length < 8) {
      setMessage('Use a password with at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('The passwords do not match.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setMessage(error.message)
        return
      }

      await supabase.auth.signOut()
      setSession(null)
      setPasswordFlow(null)
      setStatus('signedOut')
      setMessage(passwordFlow === 'invite'
        ? 'Password set. Sign in when your role is enabled in the system.'
        : 'Password updated. Sign in with your new password.')
      setNewPassword('')
      setConfirmPassword('')
      window.history.replaceState({}, '', window.location.pathname)
    } catch {
      setMessage('Could not reach Supabase. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      {status !== 'authorized' && (
        <header className="topbar">
          <BrandLockup />
          <div className="topbar-meta"><span className="status-dot" /> ADMIN PORTAL</div>
        </header>
      )}

      {status === 'authorized' && role === 'ADMIN' ? (
        <InventoryManager
          supabase={supabase}
          email={email}
          onSignOut={handleSignOut}
          signingOut={busy}
        />
      ) : status === 'authorized' && (role === 'APPROVER' || role === 'RECEIVER') ? (
        role === 'APPROVER'
          ? <ApproverDashboard supabase={supabase} email={email} onSignOut={handleSignOut} signingOut={busy} />
          : <ReceiverDashboard supabase={supabase} email={email} onSignOut={handleSignOut} signingOut={busy} />
      ) : (
        <section className="login-layout" aria-labelledby="login-title">
          <div className="login-aside">
            <div className="aside-copy">
              <p className="eyebrow">PRIMETECH OIL, INC.</p>
              <h1>Office supplies<br />Requisition system</h1>
              <p className="aside-description">Manage supply availability and keep office requests moving.</p>
            </div>
            <div className="aside-foot">
              <span>CONTROLLED ACCESS</span>
              <span>01 - ADMINISTRATION</span>
            </div>
          </div>

          <div className="login-panel">
            {status === 'checking' ? (
              <div className="checking-state" role="status"><span className="spinner" />Checking your session</div>
            ) : status === 'passwordSetup' ? (
              <>
                <div className="form-heading">
                  <p className="eyebrow">ACCOUNT ACCESS</p>
                  <h2 id="login-title">Set your password</h2>
                  <p>{passwordFlow === 'invite' ? 'Choose a password to activate your account.' : 'Choose a new password for your account.'}</p>
                </div>
                <form className="login-form" onSubmit={handlePasswordSetup}>
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength="8"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                  <label htmlFor="confirm-password">Confirm password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength="8"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                  {message && <p className="form-message" role="alert">{message}</p>}
                  <button className="submit-button" type="submit" disabled={busy}>
                    {busy ? 'Saving...' : 'Save password'} <span aria-hidden="true">&gt;</span>
                  </button>
                </form>
              </>
            ) : status === 'setup' ? (
              <div className="setup-state" role="status">
                <p className="eyebrow">CONFIGURATION REQUIRED</p>
                <h2>Connect your Supabase project</h2>
                <p>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your environment to enable administrator sign-in.</p>
              </div>
            ) : (
              <>
                <div className="form-heading">
                  <p className="eyebrow">ADMINISTRATOR ACCESS</p>
                  <h2 id="login-title">Sign in</h2>
                  <p>Use your authorized administrator account.</p>
                </div>
                <form className="login-form" onSubmit={handleSignIn}>
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="name@organization.org"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />

                  <div className="password-label-row">
                    <label htmlFor="password">Password</label>
                    <button className="reveal-button" type="button" onClick={() => setShowPassword((visible) => !visible)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />

                  {message && <p className="form-message" role="alert">{message}</p>}
                  <button className="submit-button" type="submit" disabled={busy}>
                    {busy ? 'Signing in...' : 'Sign in'} <span aria-hidden="true">&gt;</span>
                  </button>
                </form>
                <p className="secure-note"><span aria-hidden="true">LOCK</span> Protected administrator access</p>
              </>
            )}
          </div>
        </section>
      )}

      <footer className="page-footer">
        <span>SUPPLY OPERATIONS</span>
        <span>AUTHORIZED PERSONNEL ONLY</span>
      </footer>
    </main>
  )
}

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '')
  if (pathname === '/request') return <RequestorPortal supabase={supabase} />
  return <AdminApp />
}

export default App
