import { useState } from 'react'
import ChatAvatar from '../../chat/components/ChatAvatar'
import ChatIcon from '../../chat/components/ChatIcon'

function ContactDetails({ chat, onClose, onViewMedia, onFileAction, onCall, onInviteMember }) {
  const [userId, setUserId] = useState('')
  const statusLabel = chat.status === 'online'
    ? 'Aktif sekarang'
    : chat.status === 'group'
      ? 'Grup percakapan'
      : 'Terakhir dilihat hari ini'

  return (
    <aside className="details-panel" id="contact-details-panel" aria-label={`Detail kontak ${chat.name}`}>
      <div className="details-topline">
        <span>DETAIL KONTAK</span>
        <button className="icon-button" type="button" aria-label="Tutup detail kontak" onClick={onClose}>
          <ChatIcon name="close" size={18} />
        </button>
      </div>
      <div className="contact-card">
        <div className="contact-avatar-wrap">
          <ChatAvatar chat={chat} />
        </div>
        <h2>{chat.name}</h2>
        <p className="contact-status">
          <span className={chat.status === 'online' ? 'status-dot' : 'status-dot status-dot-muted'} />
          {statusLabel}
        </p>
        <div className="contact-actions">
          <button type="button" aria-label="Panggilan suara" onClick={onCall}><ChatIcon name="phone" size={18} /><span>Telepon</span></button>
          <button type="button" aria-label="Panggilan video" onClick={onCall}><ChatIcon name="video" size={18} /><span>Video</span></button>
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-section-title"><strong>Media bersama</strong><button className="text-button" type="button" onClick={onViewMedia}>Lihat semua</button></div>
        <div className="media-grid">
          <button type="button" className="media-tile media-one" aria-label="Lihat media contoh 1" onClick={onViewMedia}><span>🌿</span></button>
          <button type="button" className="media-tile media-two" aria-label="Lihat media contoh 2" onClick={onViewMedia}><span>☕</span></button>
          <button type="button" className="media-tile media-three" aria-label="Lihat media contoh 3" onClick={onViewMedia}><span>🌇</span></button>
        </div>
        <span className="media-caption">12 foto · 3 dokumen</span>
      </div>
      {chat.status === 'group' && (
        <form
          className="detail-section"
          onSubmit={async (event) => {
            event.preventDefault()
            const invited = await onInviteMember(userId)
            if (invited) setUserId('')
          }}
        >
          <div className="detail-section-title"><strong>Undang anggota</strong></div>
          <label>
            ID pengguna
            <input
              inputMode="numeric"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            />
          </label>
          <button className="text-button" type="submit">Kirim undangan</button>
        </form>
      )}
      <div className="detail-section shared-files">
        <div className="detail-section-title"><strong>File dibagikan</strong><button className="more-button" type="button" aria-label="Opsi file" onClick={onFileAction}><ChatIcon name="more" size={18} /></button></div>
        <button className="file-card" type="button" onClick={onFileAction}>
          <span className="file-icon">PDF</span>
          <span className="file-copy"><strong>Itinerary weekend.pdf</strong><small>2.4 MB · 12 Okt 2026</small></span>
          <ChatIcon name="more" size={18} />
        </button>
      </div>
      <div className="encryption-note"><span className="lock-icon">✦</span><span>Pesanmu aman dan hanya bisa dibaca oleh kamu dan {chat.name.split(' ')[0]}.</span></div>
    </aside>
  )
}

export default ContactDetails
