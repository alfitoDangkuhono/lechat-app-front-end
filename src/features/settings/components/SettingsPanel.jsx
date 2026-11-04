import ChatIcon from '../../chat/components/ChatIcon'

function SettingsPanel({
  theme,
  notificationsEnabled,
  readReceiptsEnabled,
  messageFontSize,
  messageFontFamily,
  onThemeChange,
  onNotificationsChange,
  onReadReceiptsChange,
  onMessageFontSizeChange,
  onMessageFontFamilyChange,
  onClose,
}) {
  const isDark = theme === 'dark'

  return (
    <aside className="details-panel settings-panel" id="settings-panel" aria-label="Pengaturan aplikasi">
      <div className="details-topline">
        <span>PENGATURAN</span>
        <button className="icon-button" type="button" aria-label="Kembali ke profil pribadi" onClick={onClose}>
          <ChatIcon name="back" size={18} />
        </button>
      </div>

      <div className="settings-intro">
        <span className="settings-intro-icon"><ChatIcon name="settings" size={20} /></span>
        <h2>Atur ruang chat-mu.</h2>
        <p>Sesuaikan tampilan agar nyaman untuk kamu.</p>
      </div>

      <section className="settings-section" aria-labelledby="appearance-heading">
        <span className="profile-section-label" id="appearance-heading">TAMPILAN</span>
        <div className="settings-option">
          <span className={`settings-option-icon ${isDark ? 'settings-icon-dark' : 'settings-icon-light'}`}>
            <ChatIcon name={isDark ? 'moon' : 'sun'} size={18} />
          </span>
          <span className="settings-option-copy">
            <strong>Mode gelap</strong>
            <small>{isDark ? 'Tampilan gelap aktif' : 'Gunakan tema gelap di dashboard'}</small>
          </span>
          <button
            className="theme-switch"
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Mode gelap"
            onClick={onThemeChange}
          >
            <span />
          </button>
        </div>
        <div className="theme-preview" aria-hidden="true">
          <div className={`theme-preview-card ${isDark ? 'preview-dark' : 'preview-light'}`}>
            <span />
            <i /><i /><i />
          </div>
          <span className="theme-preview-caption">{isDark ? 'Gelap' : 'Terang'} · tersimpan di perangkat ini</span>
        </div>
        <div className="settings-option settings-font-size-option">
          <span className="settings-option-icon settings-icon-light settings-font-icon" aria-hidden="true">Aa</span>
          <label className="settings-option-copy" htmlFor="message-font-size">
            <strong>Ukuran teks chat</strong>
            <small>Atur ukuran teks pesan dan kolom penulisan</small>
          </label>
          <select
            id="message-font-size"
            className="settings-font-size-select"
            value={messageFontSize}
            onChange={(event) => onMessageFontSizeChange(event.target.value)}
          >
            <option value="small">Kecil</option>
            <option value="medium">Sedang</option>
            <option value="large">Besar</option>
          </select>
        </div>
        <div className="settings-option settings-font-size-option">
          <span className="settings-option-icon settings-icon-light settings-font-icon" aria-hidden="true">Ag</span>
          <label className="settings-option-copy" htmlFor="message-font-family">
            <strong>Jenis font</strong>
            <small>Pilih gaya tulisan untuk chat dan pengaturan</small>
          </label>
          <select
            id="message-font-family"
            className="settings-font-size-select"
            value={messageFontFamily}
            onChange={(event) => onMessageFontFamilyChange(event.target.value)}
          >
            <option value="system">Standar</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
          </select>
        </div>
      </section>

      <section className="settings-section settings-general" aria-labelledby="general-heading">
        <span className="profile-section-label" id="general-heading">UMUM</span>
        <div className="settings-option settings-option-static">
          <span className="settings-option-icon settings-icon-light"><ChatIcon name="bell" size={18} /></span>
          <span className="settings-option-copy">
            <strong>Notifikasi aplikasi</strong>
            <small>Suara dan pesan baru · perlu interaksi pertama</small>
          </span>
          <button
            className="theme-switch"
            type="button"
            role="switch"
            aria-checked={notificationsEnabled}
            aria-label="Notifikasi aplikasi"
            onClick={onNotificationsChange}
          >
            <span />
          </button>
        </div>
        <div className="settings-option settings-option-static">
          <span className="settings-option-icon settings-icon-light"><ChatIcon name="lock" size={18} /></span>
          <span className="settings-option-copy">
            <strong>Tanda pesan terkirim</strong>
            <small>Tampilkan centang di pesanmu</small>
          </span>
          <button
            className="theme-switch"
            type="button"
            role="switch"
            aria-checked={readReceiptsEnabled}
            aria-label="Tanda pesan terkirim"
            onClick={onReadReceiptsChange}
          >
            <span />
          </button>
        </div>
      </section>

      <p className="profile-demo-note">Preferensi disimpan secara lokal. Notifikasi push dan kontrol privasi akun memerlukan layanan backend.</p>
    </aside>
  )
}

export default SettingsPanel
