import { useState } from 'react'
import ChatIcon from '../../chat/components/ChatIcon'
import { profileInitials } from '../services/profileService'

function PersonalProfile({
  profile,
  isLoading,
  loadError,
  onRetry,
  onClose,
  onLogout,
}) {
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
        <div className="personal-profile-avatar avatar avatar-profile">{profileInitials(profile)}</div>
        <span className="profile-account-badge">AKUN SAYA</span>
        <h2>{profile?.name || 'Nama belum tersedia'}</h2>
      </div>

      {isLoading && <p className="empty-state" role="status">Memuat profil...</p>}
      {loadError && (
        <div className="chat-load-error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={onRetry}>Coba lagi</button>
        </div>
      )}
      <div className="profile-info-section">
        <span className="profile-section-label">INFORMASI AKUN</span>
        <div className="profile-info-row">
          <span className="profile-info-icon"><ChatIcon name="mail" size={17} /></span>
          <span><small>Email</small><strong>{profile?.email || 'Belum tersedia'}</strong></span>
        </div>
        <div className="profile-info-row">
          <span className="profile-info-icon"><ChatIcon name="phone" size={17} /></span>
          <span><small>Nomor telepon</small><strong>{profile?.phone || 'Belum tersedia'}</strong></span>
        </div>
        <div className="profile-info-row">
          <span className="profile-info-icon"><ChatIcon name="info" size={17} /></span>
          <span><small>Tentang</small><strong>{profile?.about || 'Belum tersedia'}</strong></span>
        </div>
      </div>
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
