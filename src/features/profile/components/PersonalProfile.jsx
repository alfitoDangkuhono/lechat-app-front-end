import { useState } from 'react'
import ChatIcon from '../../chat/components/ChatIcon'

function PersonalProfile({ onClose, onLogout }) {
  const [logoutError, setLogoutError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setLogoutError('')
    setIsLoggingOut(true)

    try {
      await onLogout()
    } catch (error) {
      setLogoutError(
        error instanceof Error && error.message
          ? error.message
          : 'Logout gagal. Silakan coba lagi.',
      )
      setIsLoggingOut(false)
    }
  }

  return (
    <aside className="details-panel personal-profile-panel" id="personal-profile-panel" aria-label="Profil pribadi">
      <div className="details-topline">
        <span>PROFIL PRIBADI</span>
        <button className="icon-button" type="button" aria-label="Tutup profil pribadi" onClick={onClose}>
          <ChatIcon name="close" size={18} />
        </button>
      </div>

      <div className="personal-profile-card">
        <div className="personal-profile-avatar avatar avatar-profile">AR</div>
        <span className="profile-account-badge">AKUN SAYA</span>
        <h2>Alexandra Rahma</h2>
        <p className="profile-handle">@alexandra.rahma</p>
        <span className="profile-presence"><i /> Aktif sekarang</span>
      </div>

      <div className="profile-info-section">
        <span className="profile-section-label">INFORMASI AKUN</span>
        <div className="profile-info-row">
          <span className="profile-info-icon"><ChatIcon name="mail" size={17} /></span>
          <span><small>Email</small><strong>alexandra@example.com</strong></span>
        </div>
        <div className="profile-info-row">
          <span className="profile-info-icon"><ChatIcon name="phone" size={17} /></span>
          <span><small>Nomor telepon</small><strong>+62 812-3456-7890</strong></span>
        </div>
        <div className="profile-info-row">
          <span className="profile-info-icon"><ChatIcon name="info" size={17} /></span>
          <span><small>Tentang</small><strong>Senang terhubung denganmu ✨</strong></span>
        </div>
      </div>

      <div className="profile-preferences">
        <span className="profile-section-label">PREFERENSI</span>
        <div className="profile-preference-row">
          <span className="preference-indicator preference-green" />
          <span><strong>Status online</strong><small>Terlihat oleh kontak</small></span>
          <span className="preference-value">Aktif</span>
        </div>
        <div className="profile-preference-row">
          <span className="preference-indicator preference-sand" />
          <span><strong>Privasi pesan</strong><small>Hanya untuk peserta chat</small></span>
          <ChatIcon name="check" size={16} className="preference-check" />
        </div>
      </div>

      <p className="profile-demo-note">Informasi profil ini hanya contoh tampilan dan belum tersimpan ke akun.</p>
      {logoutError && <p className="login-error" role="alert">{logoutError}</p>}
      <button
        className="profile-logout-button"
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        aria-busy={isLoggingOut}
      >
        {isLoggingOut ? 'Logging out...' : 'Log out'}
      </button>
    </aside>
  )
}

export default PersonalProfile
