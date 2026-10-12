import { useEffect } from 'react'
import ChatAvatar from './ChatAvatar'
import ChatIcon from './ChatIcon'
import { ContactsList } from '../../contact'

function ChatSidebar({
  chats,
  filteredChats,
  archivedChats,
  isLoading,
  loadError,
  activeId,
  filter,
  search,
  showConversations,
  isProfileExpanded,
  isSettingsExpanded,
  activeView,
  onFilterChange,
  onViewChange,
  onNewChat,
  onRetryLoad,
  onRestoreChat,
  onClearFilter,
  onSearchChange,
  onSelectChat,
  onProfileClick,
  onSettingsClick,
}) {
  const unreadTotal = chats.filter((chat) => !chat.archived && chat.unread > 0).length

  useEffect(() => {
    function handleSearchShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        const searchInput = [...document.querySelectorAll('.conversations input[type="search"]')]
          .find((input) => input.getClientRects().length > 0)
        if (searchInput) {
          event.preventDefault()
          searchInput.focus()
        }
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  return (
    <>
      <aside className="nav-rail" aria-label="Navigasi utama">
        <button className="brand-mark" type="button" aria-label="Kembali ke pesan" onClick={() => onViewChange('chats')}>
          <ChatIcon name="message" size={22} />
        </button>
        <nav className="rail-nav">
          <button
            className={`rail-button${activeView === 'chats' ? ' active' : ''}`}
            type="button"
            aria-label="Pesan"
            aria-current={activeView === 'chats' ? 'page' : undefined}
            onClick={() => onViewChange('chats')}
          >
            <ChatIcon name="message" />
          </button>
          <button
            className={`rail-button${activeView === 'contacts' ? ' active' : ''}`}
            type="button"
            aria-label="Kontak"
            aria-current={activeView === 'contacts' ? 'page' : undefined}
            onClick={() => onViewChange('contacts')}
          >
            <ChatIcon name="users" />
          </button>
          <button
            className={`rail-button${activeView === 'archive' ? ' active' : ''}`}
            type="button"
            aria-label="Arsip"
            aria-current={activeView === 'archive' ? 'page' : undefined}
            onClick={() => onViewChange('archive')}
          >
            <ChatIcon name="archive" />
          </button>
        </nav>
        <div className="rail-bottom">
          <button
            className={`rail-button${isSettingsExpanded ? ' active' : ''}`}
            type="button"
            aria-label="Buka pengaturan"
            aria-expanded={isSettingsExpanded}
            aria-controls="settings-panel"
            onClick={onSettingsClick}
          >
            <ChatIcon name="settings" />
          </button>
          <button
            className="avatar avatar-profile profile-rail-trigger"
            type="button"
            aria-label="Buka profil pribadi"
            aria-expanded={isProfileExpanded}
            aria-controls="personal-profile-panel"
            onClick={onProfileClick}
          >
            AR
          </button>
        </div>
      </aside>

      <aside className={`conversations${showConversations ? ' conversations-mobile-open' : ''}${activeView === 'contacts' ? ' contacts-view' : ''}`}>
        <div className="conversation-heading">
          <div>
            <span className="eyebrow">{activeView === 'contacts' ? 'JARINGAN KAMU' : activeView === 'archive' ? 'TERSIMPAN' : 'RUANG KAMU'}</span>
            <h1>{activeView === 'contacts' ? 'Kontak' : activeView === 'archive' ? 'Arsip' : 'Pesan'}</h1>
          </div>
          <div className="conversation-heading-actions">
            <button
              className={`icon-button mobile-list-action${isProfileExpanded ? ' active' : ''}`}
              type="button"
              aria-label="Buka profil pribadi"
              aria-expanded={isProfileExpanded}
              aria-controls="personal-profile-panel"
              onClick={onProfileClick}
            >
              <span className="avatar avatar-profile">AR</span>
            </button>
            <button
              className={`icon-button mobile-list-action${isSettingsExpanded ? ' active' : ''}`}
              type="button"
              aria-label="Buka pengaturan"
              aria-expanded={isSettingsExpanded}
              aria-controls="settings-panel"
              onClick={onSettingsClick}
            >
              <ChatIcon name="settings" size={19} />
            </button>
            <button className="icon-button new-chat-button" type="button" aria-label="Buat percakapan baru" onClick={onNewChat} disabled={isLoading}>
              <ChatIcon name="plus" size={19} />
            </button>
          </div>
        </div>

        <div className="mobile-view-tabs" aria-label="Tampilan daftar">
          <button
            type="button"
            className={activeView === 'chats' ? 'selected' : ''}
            aria-current={activeView === 'chats' ? 'page' : undefined}
            onClick={() => onViewChange('chats')}
          >
            <ChatIcon name="message" size={15} /> Pesan
          </button>
          <button
            type="button"
            className={activeView === 'contacts' ? 'selected' : ''}
            aria-current={activeView === 'contacts' ? 'page' : undefined}
            onClick={() => onViewChange('contacts')}
          >
            <ChatIcon name="users" size={15} /> Kontak
          </button>
          <button
            type="button"
            className={activeView === 'archive' ? 'selected' : ''}
            aria-current={activeView === 'archive' ? 'page' : undefined}
            onClick={() => onViewChange('archive')}
          >
            <ChatIcon name="archive" size={15} /> Arsip
            {archivedChats.length > 0 && <span className="mobile-archive-count">{archivedChats.length}</span>}
          </button>
        </div>

        {isLoading ? (
          <p className="empty-state" role="status">Memuat percakapan...</p>
        ) : loadError ? (
          <div className="chat-load-error" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={onRetryLoad}>Coba lagi</button>
          </div>
        ) : activeView === 'contacts' ? (
          <ContactsList
            chats={chats.filter((chat) => !chat.archived)}
            search={search}
            onSearchChange={onSearchChange}
            onSelectContact={onSelectChat}
          />
        ) : activeView === 'archive' ? (
          <>
            <label className="search-box">
              <ChatIcon name="search" size={18} />
              <input
                type="search"
                placeholder="Cari arsip..."
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
            <div className="list-heading">
              <span>Percakapan diarsipkan</span>
              <span className="filter-count">{archivedChats.length}</span>
            </div>
            <div className="conversation-list">
              {filteredChats.map((chat) => (
                <div className="archived-conversation-item" key={chat.id}>
                  <ChatAvatar chat={chat} />
                  <span className="conversation-copy">
                    <span className="conversation-topline"><strong>{chat.name}</strong></span>
                    <span className="conversation-bottomline"><span>{chat.preview}</span></span>
                  </span>
                  <button
                    className="restore-chat-button"
                    type="button"
                    onClick={() => onRestoreChat(chat.id)}
                    aria-label={`Kembalikan percakapan ${chat.name}`}
                  >
                    Kembalikan
                  </button>
                </div>
              ))}
              {filteredChats.length === 0 && (
                <p className="empty-state">{archivedChats.length ? 'Arsip tidak ditemukan.' : 'Belum ada percakapan yang diarsipkan.'}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <label className="search-box">
              <ChatIcon name="search" size={18} />
              <input
                type="search"
                placeholder="Cari percakapan..."
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>

            <div className="list-heading">
              <span>Percakapan</span>
              <button className="text-button" type="button" onClick={onClearFilter}>Lihat semua</button>
            </div>
            <div className="filter-tabs" aria-label="Filter percakapan">
              {['Semua', 'Belum dibaca'].map((tab) => (
                <button
                  key={tab}
                  className={`filter-tab${filter === tab ? ' selected' : ''}`}
                  onClick={() => onFilterChange(tab)}
                >
                  {tab}
                  {tab === 'Belum dibaca' && <span className="filter-count">{unreadTotal}</span>}
                </button>
              ))}
            </div>

            <div className="conversation-list">
              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  className={`conversation-item${activeId === chat.id ? ' selected' : ''}`}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <ChatAvatar chat={chat} />
                  <span className="conversation-copy">
                    <span className="conversation-topline">
                      <strong>{chat.name}</strong>
                      <time>{chat.time}</time>
                    </span>
                    <span className="conversation-bottomline">
                      <span>{chat.preview}</span>
                      {chat.unread > 0 && <span className="unread-count">{chat.unread}</span>}
                    </span>
                  </span>
                </button>
              ))}
              {filteredChats.length === 0 && (
                <p className="empty-state">Tidak ada percakapan yang cocok.</p>
              )}
            </div>

            <div className="inbox-note">
              <span className="note-icon"><ChatIcon name="pin" size={17} /></span>
              <div>
                <strong>Jaga obrolan tetap dekat</strong>
                <p>Semua percakapanmu, di satu tempat.</p>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

export default ChatSidebar
