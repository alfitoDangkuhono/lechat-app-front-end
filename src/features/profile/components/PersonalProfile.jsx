import { useRef, useState } from 'react'
import ChatIcon from '../../chat/components/ChatIcon'
import ProfileAvatar from './ProfileAvatar'
import {
  getCurrentUserProfile,
  profileInitials,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from '../services/profileService'

const EDITABLE_FIELDS = ['first_name', 'last_name', 'phone', 'about']

function editableProfile(profile) {
  return {
    first_name: profile?.first_name ?? '',
    last_name: profile?.last_name ?? '',
    phone: profile?.phone ?? '',
    about: profile?.about ?? '',
  }
}

function PersonalProfile({
  profile,
  profileAvatarUrl,
  onAvatarImageError,
  isLoading,
  loadError,
  onRetry,
  onProfileUpdated,
  onSettingsClick,
  onClose,
  onLogout,
}) {
  const [logoutError, setLogoutError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [avatarUploadError, setAvatarUploadError] = useState('')
  const [avatarUploadMessage, setAvatarUploadMessage] = useState('')
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef(null)
  const photoDialogRef = useRef(null)

  const originalForm = editableProfile(profile)
  const formValues = form ?? originalForm
  const hasChanges = EDITABLE_FIELDS.some(
    (field) => formValues[field].trim() !== originalForm[field].trim(),
  )
  const hasValidForm = EDITABLE_FIELDS.every((field) => formValues[field].trim())

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

  async function handleSave(event) {
    event.preventDefault()
    setSaveError('')
    setSaveMessage('')

    const normalizedForm = Object.fromEntries(
      EDITABLE_FIELDS.map((field) => [field, formValues[field].trim()]),
    )
    if (!EDITABLE_FIELDS.every((field) => normalizedForm[field])) {
      setSaveError('Semua field wajib diisi.')
      return
    }
    if (!EDITABLE_FIELDS.some((field) => normalizedForm[field] !== originalForm[field].trim())) {
      setSaveError('Tidak ada perubahan untuk disimpan.')
      return
    }

    setIsSaving(true)
    try {
      const updatedProfile = await updateCurrentUserProfile(normalizedForm)
      onProfileUpdated(updatedProfile)
      setForm(null)
      setIsEditing(false)
      setSaveMessage('Profil berhasil diperbarui.')
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : 'Profil gagal diperbarui. Silakan coba lagi.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setAvatarUploadError('')
    setAvatarUploadMessage('')
    setIsUploadingAvatar(true)

    let uploadCompleted = false
    try {
      await uploadCurrentUserAvatar(file)
      uploadCompleted = true
      const updatedProfile = await getCurrentUserProfile()
      onProfileUpdated(updatedProfile)
      setAvatarUploadMessage('Foto profil berhasil diunggah.')
    } catch (error) {
      setAvatarUploadError(
        uploadCompleted
          ? `Foto berhasil diunggah, tetapi profil gagal dimuat: ${error.message}`
          : error instanceof Error && error.message
          ? error.message
          : 'Avatar gagal diunggah. Silakan coba lagi.',
      )
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  function updateFormField(field, value) {
    setForm((current) => ({ ...(current ?? originalForm), [field]: value }))
    setSaveError('')
    setSaveMessage('')
  }

  function cancelEditing() {
    setForm(null)
    setSaveError('')
    setIsEditing(false)
  }

  function closePhotoDialog() {
    if (photoDialogRef.current?.open) photoDialogRef.current.close()
  }

  return (
    <aside className="details-panel personal-profile-panel" id="personal-profile-panel" aria-label="Profil pribadi">
      <div className="details-topline">
        <span>PROFIL PRIBADI</span>
        <div className="profile-panel-actions">
          <button className="icon-button" type="button" aria-label="Buka pengaturan" onClick={onSettingsClick}>
            <ChatIcon name="settings" size={18} />
          </button>
          <button className="icon-button" type="button" aria-label="Tutup profil pribadi" onClick={onClose}>
            <ChatIcon name="close" size={18} />
          </button>
        </div>
      </div>

      <div className="personal-profile-card">
        <div className="profile-avatar-control">
          <button
            className="personal-profile-avatar avatar avatar-profile profile-avatar-open-button"
            type="button"
            aria-label="Perbesar foto profil"
            onClick={() => photoDialogRef.current?.showModal()}
            disabled={!profileAvatarUrl}
          >
            <ProfileAvatar
              src={profileAvatarUrl}
              initials={profileInitials(profile)}
              alt={`Foto profil ${profile?.name || 'pengguna'}`}
              onExpired={onAvatarImageError}
            />
          </button>
          <input
            ref={avatarInputRef}
            className="profile-avatar-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Pilih foto profil"
            onChange={handleAvatarChange}
          />
          <button
            className="profile-avatar-upload-button"
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={isUploadingAvatar}
            aria-busy={isUploadingAvatar}
          >
            {isUploadingAvatar ? 'Mengunggah foto...' : 'Ubah foto profil'}
          </button>
          {avatarUploadError && <p className="profile-form-error" role="alert">{avatarUploadError}</p>}
          {avatarUploadMessage && <p className="profile-form-message" role="status">{avatarUploadMessage}</p>}
        </div>
        <span className="profile-account-badge">AKUN SAYA</span>
        <h2>{profile?.name || 'Nama belum tersedia'}</h2>
        {profile?.username && <span className="profile-handle">@{profile.username}</span>}
      </div>

      <dialog
        ref={photoDialogRef}
        className="profile-photo-dialog"
        aria-label={`Foto profil ${profile?.name || 'pengguna'}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePhotoDialog()
        }}
      >
        <div className="profile-photo-dialog-content">
          <button
            className="profile-photo-close"
            type="button"
            aria-label="Tutup foto profil"
            onClick={closePhotoDialog}
          >
            Tutup
          </button>
          <img
            src={profileAvatarUrl}
            alt={`Foto profil ${profile?.name || 'pengguna'}`}
            onError={onAvatarImageError}
          />
        </div>
      </dialog>

      {isLoading && <p className="empty-state" role="status">Memuat profil...</p>}
      {loadError && (
        <div className="chat-load-error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={onRetry}>Coba lagi</button>
        </div>
      )}

      {isEditing ? (
        <form className="profile-edit-form" onSubmit={handleSave}>
          <span className="profile-section-label">EDIT INFORMASI PROFIL</span>
          <label htmlFor="profile-first-name">Nama depan</label>
          <input
            id="profile-first-name"
            autoComplete="given-name"
            value={formValues.first_name}
            onChange={(event) => updateFormField('first_name', event.target.value)}
            required
          />
          <label htmlFor="profile-last-name">Nama belakang</label>
          <input
            id="profile-last-name"
            autoComplete="family-name"
            value={formValues.last_name}
            onChange={(event) => updateFormField('last_name', event.target.value)}
            required
          />
          <label htmlFor="profile-phone">Nomor telepon</label>
          <input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            value={formValues.phone}
            onChange={(event) => updateFormField('phone', event.target.value)}
            required
          />
          <label htmlFor="profile-about">Tentang</label>
          <textarea
            id="profile-about"
            rows={4}
            value={formValues.about}
            onChange={(event) => updateFormField('about', event.target.value)}
            required
          />
          <div className="profile-edit-actions">
            <button
              className="profile-save-button"
              type="submit"
              disabled={isSaving || !hasChanges || !hasValidForm}
              aria-busy={isSaving}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan perubahan'}
            </button>
            <button
              className="profile-cancel-button"
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
            >
              Batal
            </button>
          </div>
          {saveError && <p className="profile-form-error" role="alert">{saveError}</p>}
        </form>
      ) : (
        <>
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
            {profile?.username && (
              <div className="profile-info-row">
                <span className="profile-info-icon"><ChatIcon name="info" size={17} /></span>
                <span><small>Username</small><strong>{profile.username}</strong></span>
              </div>
            )}
          </div>
          <button
            className="profile-edit-button"
            type="button"
            onClick={() => {
              setForm(editableProfile(profile))
              setSaveError('')
              setSaveMessage('')
              setIsEditing(true)
            }}
            disabled={isLoading || !profile}
          >
            Edit profil
          </button>
          {saveMessage && <p className="profile-form-message" role="status">{saveMessage}</p>}
        </>
      )}

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
