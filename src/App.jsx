import { useEffect, useState } from 'react'
import AuthLayout from './features/auth/components/AuthLayout'
import { LoginPage, RegisterPage } from './features/auth'
import { checkLogin, loginUser, logoutUser, registerUser } from './features/auth/services/authService'
import { clearAuthToken, getAuthToken } from './features/auth/services/authTokenService'
import { Dashboard } from './features/chat'

function App() {
  const [authStatus, setAuthStatus] = useState(
    () => (getAuthToken() ? 'checking' : 'unauthenticated'),
  )
  const [authPage, setAuthPage] = useState('login')
  const [sessionCheckError, setSessionCheckError] = useState('')
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    const token = getAuthToken()

    if (!token) {
      return () => {
        isCurrent = false
      }
    }

    checkLogin(token)
      .then((isValid) => {
        if (isCurrent) {
          setAuthStatus(isValid ? 'authenticated' : 'unauthenticated')
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setSessionCheckError(
            error instanceof Error && error.message
              ? error.message
              : 'Sesi tidak dapat diverifikasi. Silakan coba lagi.',
          )
          setAuthStatus('check-error')
        }
      })

    return () => {
      isCurrent = false
    }
  }, [sessionCheckAttempt])

  async function handleLogin(credentials) {
    await loginUser(credentials)
    setAuthStatus('authenticated')
  }

  async function handleRegister(registration) {
    await registerUser(registration)
    setAuthStatus('authenticated')
  }

  async function handleLogout() {
    await logoutUser()
    setAuthPage('login')
    setAuthStatus('unauthenticated')
  }

  if (authStatus === 'checking') {
    return (
      <AuthLayout
        kicker="MEMERIKSA SESI"
        title="Sebentar ya."
        description="Kami sedang memverifikasi sesi akun Anda."
      >
        <div className="session-loading" role="status" aria-live="polite">
          <span className="session-loading-spinner" aria-hidden="true" />
          <span>Memeriksa sesi...</span>
        </div>
      </AuthLayout>
    )
  }

  if (authStatus === 'check-error') {
    return (
      <AuthLayout
        kicker="KONEKSI BERMASALAH"
        title="Sesi belum dapat diperiksa."
        description={sessionCheckError}
      >
        <button
          className="login-submit"
          type="button"
          onClick={() => {
            setSessionCheckError('')
            setAuthStatus('checking')
            setSessionCheckAttempt((attempt) => attempt + 1)
          }}
        >
          Coba lagi
        </button>
        <p className="auth-switch">
          <button
            type="button"
            onClick={() => {
              clearAuthToken()
              setSessionCheckError('')
              setAuthStatus('unauthenticated')
            }}
          >
            Kembali ke login
          </button>
        </p>
      </AuthLayout>
    )
  }

  if (authStatus !== 'authenticated') {
    if (authPage === 'register') {
      return (
        <RegisterPage
          onLogin={() => setAuthPage('login')}
          onRegister={handleRegister}
        />
      )
    }

    return (
      <LoginPage
        onLogin={handleLogin}
        onRegister={() => setAuthPage('register')}
      />
    )
  }

  return <Dashboard onLogout={handleLogout} />
}

export default App
