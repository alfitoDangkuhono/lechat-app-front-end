import { useState } from 'react'
import AuthLayout from './AuthLayout'
import usePasswordVisibility from '../hooks/usePasswordVisibility'
import { authenticateDemo, demoCredentials } from '../services/authService'

function LoginPage({ onLogin, onRegister }) {
  const { isVisible: showPassword, toggleVisibility: togglePasswordVisibility } = usePasswordVisibility()
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()

    if (!authenticateDemo(email, password)) {
      setLoginError('Email atau kata sandi belum sesuai dengan akun demo.')
      return
    }

    setLoginError('')
    onLogin()
  }

  function fillDemoCredentials() {
    setEmail(demoCredentials.email)
    setPassword(demoCredentials.password)
    setLoginError('')
  }

  return (
    <AuthLayout
      kicker="SELAMAT DATANG KEMBALI"
      title="Senang melihatmu lagi."
      description="Masuk untuk melanjutkan percakapanmu."
    >
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="login-email">Alamat email</label>
        <div className="login-input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <input
            id="login-email"
            name="email"
            type="email"
            placeholder="nama@email.com"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setLoginError('')
            }}
            required
          />
        </div>

        <div className="password-label-row">
          <label htmlFor="login-password">Kata sandi</label>
          <button className="forgot-password" type="button" onClick={() => setShowRecoveryNotice(true)}>Lupa kata sandi?</button>
        </div>
        {showRecoveryNotice && (
          <p className="recovery-notice" role="status">Pemulihan akun belum tersedia pada demo ini.</p>
        )}
        <div className="login-input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
          </svg>
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Masukkan kata sandi"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setLoginError('')
            }}
            required
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            aria-pressed={showPassword}
            onClick={togglePasswordVisibility}
          >
            {showPassword ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.3 4.5 9 7-.3 1.1-1 2.2-1.9 3.2M6.2 6.2C4.1 7.5 2.6 9.6 2 12c.7 2.5 4 7 10 7 1 0 1.9-.2 2.8-.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        <label className="remember-option">
          <input type="checkbox" name="remember" />
          <span className="custom-checkbox" aria-hidden="true" />
          <span>Ingat saya</span>
        </label>

        <button className="login-submit" type="submit">
          Masuk ke Lechat
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </button>
      </form>

      {loginError && <p className="login-error" role="alert">{loginError}</p>}
      <div className="demo-credentials">
        <div className="demo-credentials-copy">
          <span className="demo-credentials-label">KREDENSIAL DEMO</span>
          <span><strong>Email</strong><code>{demoCredentials.email}</code></span>
          <span><strong>Kata sandi</strong><code>{demoCredentials.password}</code></span>
        </div>
        <button type="button" onClick={fillDemoCredentials}>Gunakan</button>
      </div>
      <p className="login-demo-note"><span>i</span> Akun simulasi untuk preview UI, bukan autentikasi produksi.</p>
      <p className="auth-switch">Belum punya akun? <button type="button" onClick={onRegister}>Daftar sekarang</button></p>
    </AuthLayout>
  )
}

export default LoginPage
