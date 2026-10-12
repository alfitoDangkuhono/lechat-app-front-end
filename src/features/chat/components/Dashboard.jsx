import { useEffect, useMemo, useRef, useState } from 'react'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'
import ContactDetails from '../../contact/components/ContactDetails'
import { PersonalProfile } from '../../profile'
import { SettingsPanel, useChatPreferences, useTheme } from '../../settings'
import { chatService } from '../services/chatService'
import '../../../App.css'

function Dashboard() {
  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [message, setMessage] = useState('')
  const [showConversations, setShowConversations] = useState(true)
  const [activeView, setActiveView] = useState('chats')
  const [activeSidePanel, setActiveSidePanel] = useState(null)
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [isMediaOpen, setIsMediaOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const { theme, toggleTheme } = useTheme()
  const {
    notificationsEnabled,
    readReceiptsEnabled,
    toggleNotifications,
    toggleReadReceipts,
  } = useChatPreferences()
  const activeChat = chats.find((chat) => chat.id === activeId)
  const visibleChats = chats.filter((chat) => !chat.archived)
  const archivedChats = chats.filter((chat) => chat.archived)

  function showNotice(text) {
    window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500)
  }

  async function retryLoadConversations() {
    setIsLoading(true)
    setLoadError('')
    try {
      const loadedChats = await chatService.listConversations()
      setChats(loadedChats)
      setActiveId(loadedChats.find((chat) => !chat.archived)?.id ?? null)
    } catch (error) {
      setLoadError(error.message || 'Percakapan gagal dimuat.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    chatService.listConversations()
      .then((loadedChats) => {
        if (!isMounted) return
        setChats(loadedChats)
        setActiveId(loadedChats.find((chat) => !chat.archived)?.id ?? null)
      })
      .catch((error) => {
        if (isMounted) setLoadError(error.message || 'Percakapan gagal dimuat.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
      window.clearTimeout(noticeTimer.current)
    }
  }, [])

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sourceChats = activeView === 'archive' ? archivedChats : visibleChats
    return sourceChats.filter((chat) => {
      const matchesSearch = `${chat.name} ${chat.preview}`.toLowerCase().includes(query)
      const matchesFilter = activeView !== 'chats'
        || filter === 'Semua'
        || (filter === 'Belum dibaca' && chat.unread > 0)
      return matchesSearch && matchesFilter
    })
  }, [activeView, archivedChats, filter, search, visibleChats])

  async function selectChat(chatId) {
    try {
      const updatedChat = await chatService.markConversationRead(chatId)
      setActiveId(chatId)
      setActiveView('chats')
      setChats((current) => current.map((chat) => (
        chat.id === chatId ? updatedChat : chat
      )))
      setShowConversations(false)
    } catch (error) {
      showNotice(error.message || 'Percakapan gagal dibuka.')
    }
  }

  async function createConversation(name, type) {
    try {
      const { conversation, created } = await chatService.createConversation({ name, type })
      setChats((current) => created
        ? [conversation, ...current]
        : current.map((chat) => chat.id === conversation.id ? conversation : chat))
      setActiveId(conversation.id)
      setActiveView('chats')
      setFilter('Semua')
      setSearch('')
      setShowConversations(false)
      setIsNewChatOpen(false)
      if (!created) showNotice('Percakapan yang sudah ada dibuka kembali.')
    } catch (error) {
      showNotice(error.message || 'Percakapan gagal dibuat.')
    }
  }

  async function archiveChat(chatId) {
    const remainingChats = visibleChats.filter((chat) => chat.id !== chatId)
    try {
      const archivedChat = await chatService.archiveConversation(chatId)
      setChats((current) => current.map((chat) => (
        chat.id === chatId ? archivedChat : chat
      )))
      if (activeId === chatId) setActiveId(remainingChats[0]?.id ?? null)
      setShowConversations(remainingChats.length === 0 || activeId === chatId)
      setActiveView('chats')
      setActiveSidePanel(null)
      showNotice('Percakapan dipindahkan ke arsip.')
    } catch (error) {
      showNotice(error.message || 'Percakapan gagal diarsipkan.')
    }
  }

  async function restoreChat(chatId) {
    try {
      const restoredChat = await chatService.restoreConversation(chatId)
      setChats((current) => current.map((chat) => (
        chat.id === chatId ? restoredChat : chat
      )))
      showNotice('Percakapan dikembalikan ke daftar pesan.')
    } catch (error) {
      showNotice(error.message || 'Percakapan gagal dipulihkan.')
    }
  }

  async function sendMessage(event, attachments = []) {
    event.preventDefault()
    const text = message.trim()
    if (!text && attachments.length === 0) return
    if (!activeChat) {
      showNotice('Pilih atau buat percakapan sebelum mengirim pesan.')
      return
    }

    const updatedChat = await chatService.sendMessage(activeId, { text, attachments })
    setChats((current) => [
      updatedChat,
      ...current.filter((chat) => chat.id !== activeId),
    ])
    setMessage('')
  }

  return (
    <main
      className={`app-shell${activeSidePanel ? ' side-panel-open' : ''}`}
      data-theme={theme}
    >
      <ChatSidebar
        chats={chats}
        filteredChats={filteredChats}
        archivedChats={archivedChats}
        isLoading={isLoading}
        loadError={loadError}
        activeId={activeId}
        filter={filter}
        search={search}
        showConversations={showConversations}
        activeView={activeView}
        isProfileExpanded={activeSidePanel === 'profile'}
        isSettingsExpanded={activeSidePanel === 'settings'}
        onFilterChange={setFilter}
        onViewChange={(view) => {
          setActiveView(view)
          setShowConversations(true)
        }}
        onNewChat={() => setIsNewChatOpen(true)}
        onRetryLoad={retryLoadConversations}
        onRestoreChat={restoreChat}
        onClearFilter={() => {
          setSearch('')
          setFilter('Semua')
        }}
        onSearchChange={setSearch}
        onSelectChat={selectChat}
        onProfileClick={() => setActiveSidePanel((panel) => panel === 'profile' ? null : 'profile')}
        onSettingsClick={() => setActiveSidePanel((panel) => panel === 'settings' ? null : 'settings')}
      />
      <ChatWindow
        key={activeId ?? 'empty-chat'}
        chat={activeChat}
        message={message}
        onBack={() => setShowConversations(true)}
        onProfileClick={() => setActiveSidePanel((panel) => panel === 'contact' ? null : 'contact')}
        onArchiveChat={() => activeChat && archiveChat(activeChat.id)}
        onNotice={showNotice}
        readReceiptsEnabled={readReceiptsEnabled}
        isProfileExpanded={activeSidePanel === 'contact'}
        onMessageChange={setMessage}
        onSendMessage={(event, attachments) => sendMessage(event, attachments)}
      />
      {notice && <div className="chat-toast" role="status">{notice}</div>}
      {activeSidePanel && (
        <>
          <button
            className="side-panel-backdrop"
            type="button"
            aria-label="Tutup panel profil"
            onClick={() => setActiveSidePanel(null)}
          />
          {activeSidePanel === 'contact' ? (
            <ContactDetails
              chat={activeChat}
              onClose={() => setActiveSidePanel(null)}
              onViewMedia={() => setIsMediaOpen(true)}
              onFileAction={() => showNotice('File contoh ini belum tersedia untuk diunduh.')}
              onCall={() => showNotice('Fitur panggilan belum terhubung ke layanan.')}
            />
          ) : activeSidePanel === 'profile' ? (
            <PersonalProfile onClose={() => setActiveSidePanel(null)} />
          ) : (
            <SettingsPanel
              theme={theme}
              onThemeChange={toggleTheme}
              notificationsEnabled={notificationsEnabled}
              readReceiptsEnabled={readReceiptsEnabled}
              onNotificationsChange={toggleNotifications}
              onReadReceiptsChange={toggleReadReceipts}
              onClose={() => setActiveSidePanel(null)}
            />
          )}
        </>
      )}
      {isNewChatOpen && (
        <NewChatDialog
          onClose={() => setIsNewChatOpen(false)}
          onCreate={createConversation}
        />
      )}
      {isMediaOpen && (
        <MediaGallery onClose={() => setIsMediaOpen(false)} />
      )}
    </main>
  )
}

function NewChatDialog({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('contact')

  function handleSubmit(event) {
    event.preventDefault()
    onCreate(name, type)
  }

  return (
    <div className="chat-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="chat-modal-heading">
          <div>
            <span className="eyebrow">MULAI TERHUBUNG</span>
            <h2 id="new-chat-title">Percakapan baru</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label htmlFor="new-chat-name">Nama kontak atau grup</label>
          <input
            autoFocus
            id="new-chat-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Contoh: Dita atau Tim Produk"
            required
          />
          <label className="new-chat-type-label" htmlFor="new-chat-type">Jenis percakapan</label>
          <select id="new-chat-type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="contact">Kontak</option>
            <option value="group">Grup</option>
          </select>
          <p>Percakapan akan dibuat secara lokal untuk demo ini.</p>
          <div className="chat-modal-actions">
            <button type="button" onClick={onClose}>Batal</button>
            <button type="submit" disabled={!name.trim()}>Buat percakapan</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function MediaGallery({ onClose }) {
  return (
    <div className="chat-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="chat-modal media-gallery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-gallery-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="chat-modal-heading">
          <div>
            <span className="eyebrow">ARSIP MEDIA DEMO</span>
            <h2 id="media-gallery-title">Media bersama</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        <div className="gallery-grid" aria-label="Contoh media">
          <div className="media-tile media-one"><span>🌿</span></div>
          <div className="media-tile media-two"><span>☕</span></div>
          <div className="media-tile media-three"><span>🌇</span></div>
        </div>
        <p>Pratinjau media hanya contoh dan belum terhubung ke penyimpanan.</p>
      </section>
    </div>
  )
}

export default Dashboard
