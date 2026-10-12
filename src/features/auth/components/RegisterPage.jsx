import { useState } from 'react'
import AuthLayout from './AuthLayout'
import usePasswordVisibility from '../hooks/usePasswordVisibility'
import { normalizeRegistrationData, validateRegistration } from '../utils/registrationValidation'

function RegisterPage({ onLogin, onRegister }) {
  const { isVisible: showPassword, toggleVisibility: togglePasswordVisibility } = usePasswordVisibility()
  const { isVisible: showConfirmPassword, toggleVisibility: toggleConfirmPasswordVisibility } = usePasswordVisibility()
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const registration = {
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmation: formData.get('confirm-password'),
      termsAccepted: formData.get('terms') === 'on',
    }
    const validationError = validateRegistration(registration)

    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError('')
    setIsSubmitting(true)

    try {
      await onRegister(normalizeRegistrationData(registration))
    } catch (error) {
      setFormError(
        error instanceof Error && error.message
          ? error.message
          : 'Pendaftaran gagal. Silakan coba lagi.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function clearFormError() {
    if (formError) setFormError('')
  }

  return (
    <AuthLayout
      kicker="MULAI PERCAKAPAN BARU"
      title="Buat akun Lechat."
      description="Daftar dan tetap terhubung dengan orang-orang terdekat."
    >
      <form className="login-form register-form" onSubmit={handleSubmit}>
        <label htmlFor="register-name">Nama lengkap</label>
        <div className="login-input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 21a7 7 0 0 1 14 0" />
          </svg>
          <input id="register-name" name="name" type="text" placeholder="Nama kamu" autoComplete="name" onChange={clearFormError} required />
        </div>

        <label htmlFor="register-email">Alamat email</label>
        <div className="login-input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <input id="register-email" name="email" type="email" placeholder="nama@email.com" autoComplete="email" onChange={clearFormError} required />
        </div>

        <label htmlFor="register-password">Kata sandi</label>
        <div className="login-input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
          </svg>
          <input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Minimal 8 karakter"
            autoComplete="new-password"
            minLength={8}
            onChange={clearFormError}
            required
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            aria-pressed={showPassword}
            onClick={togglePasswordVisibility}
          >
            <PasswordVisibilityIcon visible={showPassword} />
          </button>
        </div>

        <label htmlFor="register-confirm-password">Konfirmasi kata sandi</label>
        <div className="login-input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
          </svg>
          <input
            id="register-confirm-password"
            name="confirm-password"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Ulangi kata sandi"
            autoComplete="new-password"
            minLength={8}
            onChange={clearFormError}
            required
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'}
            aria-pressed={showConfirmPassword}
            onClick={toggleConfirmPasswordVisibility}
          >
            <PasswordVisibilityIcon visible={showConfirmPassword} />
          </button>
        </div>

        <label className="remember-option terms-option">
          <input type="checkbox" name="terms" onChange={clearFormError} required />
          <span className="custom-checkbox" aria-hidden="true" />
          <span>Saya memahami bahwa ini adalah pendaftaran demo.</span>
        </label>

        {formError && <p className="login-error" role="alert">{formError}</p>}
        <button className="login-submit" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? 'Menyiapkan akun...' : 'Buat akun'}
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </button>
      </form>
      <p className="login-demo-note"><span>i</span> Registrasi demo tidak menyimpan data atau membuat akun sungguhan.</p>
      <p className="auth-switch">Sudah punya akun? <button type="button" onClick={onLogin}>Masuk</button></p>
    </AuthLayout>
  )
}

function PasswordVisibilityIcon({ visible }) {
  return visible ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.3 4.5 9 7-.3 1.1-1 2.2-1.9 3.2M6.2 6.2C4.1 7.5 2.6 9.6 2 12c.7 2.5 4 7 10 7 1 0 1.9-.2 2.8-.5" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default RegisterPage
