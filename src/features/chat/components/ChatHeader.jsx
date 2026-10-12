import { useState } from 'react'
import ChatAvatar from './ChatAvatar'

function ChatHeader({
  chat,
  onBack,
  onProfileClick,
  onArchiveChat,
  onNotice,
  isProfileExpanded,
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <header className="chat-header">
      <button className="mobile-back" onClick={onBack} aria-label="Kembali ke daftar percakapan">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        className="header-profile-button"
        type="button"
        aria-label={`Lihat detail kontak ${chat.name}`}
        aria-expanded={isProfileExpanded}
        aria-controls="contact-details-panel"
        onClick={onProfileClick}
      >
        <ChatAvatar chat={chat} />
        <span className="header-contact">
          <strong>{chat.name}</strong>
          <span>
            <i className={chat.status === 'online' ? 'status-dot' : 'status-dot status-dot-muted'} />
            {chat.status === 'online' ? 'Online' : chat.status === 'group' ? '5 anggota' : 'Terakhir dilihat hari ini'}
          </span>
        </span>
      </button>
      <div className="header-actions">
        <button className="icon-button voice-call-button" type="button" aria-label="Panggilan suara" onClick={() => onNotice('Fitur panggilan belum terhubung ke layanan.')}>
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.8a2 2 0 0 1-.6 1.7L7.6 9.5a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.4a2 2 0 0 1 1.6 2.9Z" />
          </svg>
        </button>
        <button className="icon-button" type="button" aria-label="Panggilan video" onClick={() => onNotice('Fitur panggilan video belum terhubung ke layanan.')}>
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="13" height="14" rx="2" />
            <path d="m16 10 5-3v10l-5-3" />
          </svg>
        </button>
        <span className="header-action-divider" />
        <button
          className="icon-button"
          type="button"
          aria-label="Opsi percakapan"
          aria-expanded={showActions}
          onClick={() => setShowActions((visible) => !visible)}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
        </button>
        {showActions && (
          <div className="chat-actions-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => {
              setShowActions(false)
              onArchiveChat()
            }}>
              Arsipkan percakapan
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default ChatHeader