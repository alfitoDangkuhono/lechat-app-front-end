import { useEffect, useMemo, useRef, useState } from 'react'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'
import ContactDetails from '../../contact/components/ContactDetails'
import { getCurrentUserProfile, PersonalProfile, profileInitials } from '../../profile'
import { SettingsPanel, useChatPreferences, useTheme } from '../../settings'
import { chatService } from '../services/chatService'
import { connectWebSocket } from '../services/webSocketService'
import '../../../App.css'

function mergeMessages(current, incoming) {
  const index = current.findIndex((item) => (
    String(item.id) === String(incoming.id)
    || (
      item.client_message_id
      && item.client_message_id === incoming.client_message_id
    )
  ))
  if (index < 0) return [...current, incoming]
  return current.map((item, itemIndex) => itemIndex === index
    ? { ...item, ...incoming }
    : item)
}

function mergeMessageLists(primary, secondary) {
  return secondary.reduce((messages, item) => mergeMessages(messages, item), primary)
}

function Dashboard({ onLogout }) {
  const [chats, setChats] = useState([])
  const [contacts, setContacts] = useState([])
  const [contactRequests, setContactRequests] = useState([])
  const [outgoingContactRequests, setOutgoingContactRequests] = useState([])
  const [groupInvitations, setGroupInvitations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [socketStatus, setSocketStatus] = useState('disconnected')
  const [pagination, setPagination] = useState({})
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [message, setMessage] = useState('')
  const [showConversations, setShowConversations] = useState(true)
  const [activeView, setActiveView] = useState('chats')
  const [activeSidePanel, setActiveSidePanel] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileLoadError, setProfileLoadError] = useState('')
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0)
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [isMediaOpen, setIsMediaOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const socketRef = useRef(null)
  const pendingMessagesRef = useRef(new Map())
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
  const currentProfileInitials = profileInitials(userProfile)

  function showNotice(text) {
    window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500)
  }

  function togglePersonalProfile() {
    if (activeSidePanel === 'profile') {
      setActiveSidePanel(null)
      return
    }

    setProfileLoadError('')
    setIsProfileLoading(true)
    setActiveSidePanel('profile')
  }

  function retryLoadProfile() {
    setProfileLoadError('')
    setIsProfileLoading(true)
    setProfileLoadAttempt((attempt) => attempt + 1)
  }

  async function retryLoadConversations() {
    setIsLoading(true)
    setLoadError('')
    try {
      const loadedChats = await chatService.listConversations()
      setChats(loadedChats)
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

  useEffect(() => {
    let isCurrent = true
    chatService.listContactRequests()
      .then(({ incoming, outgoing }) => {
        if (!isCurrent) return
        setContactRequests(incoming)
        setOutgoingContactRequests(outgoing)
      })
      .catch((error) => {
        if (isCurrent) showNotice(error.message || 'Permintaan kontak gagal dimuat.')
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'contacts') return undefined

    let isCurrent = true
    Promise.all([
      chatService.listContacts(),
      chatService.listContactRequests(),
      chatService.listGroupInvitations(),
    ])
      .then(([loadedContacts, loadedRequests, loadedInvitations]) => {
        if (!isCurrent) return
        setContacts(loadedContacts)
        setContactRequests(loadedRequests.incoming)
        setOutgoingContactRequests(loadedRequests.outgoing)
        setGroupInvitations(loadedInvitations)
      })
      .catch((error) => {
        if (isCurrent) showNotice(error.message || 'Kontak gagal dimuat.')
      })

    return () => {
      isCurrent = false
    }
  }, [activeView])

  useEffect(() => {
    if (activeSidePanel !== 'profile') return undefined

    let isCurrent = true
    getCurrentUserProfile()
      .then((profile) => {
        if (isCurrent) setUserProfile(profile)
      })
      .catch((error) => {
        if (isCurrent) {
          setProfileLoadError(error.message || 'Profil gagal dimuat.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsProfileLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [activeSidePanel, profileLoadAttempt])

  useEffect(() => {
    if (!activeId || isLoading) return undefined

    let isCurrent = true
    const connection = connectWebSocket({
      conversationId: activeId,
      onStatus: setSocketStatus,
      onEvent(event) {
        if (!isCurrent) return

        if (event.type === 'conversation.history') {
          const items = (event.data?.items ?? []).map(chatService.mapMessage).reverse()
          setPagination((current) => ({
            ...current,
            [activeId]: event.data?.next_before_id ?? null,
          }))
          const lastIncomingMessage = [...items].reverse().find((item) => item.from === 'them')
          const pending = [...pendingMessagesRef.current.values()]
            .filter((frame) => String(frame.conversation_id) === String(activeId))
          const confirmedIds = new Set(items.map((item) => item.client_message_id).filter(Boolean))

          pending.forEach((frame) => {
            if (confirmedIds.has(frame.client_message_id)) {
              pendingMessagesRef.current.delete(frame.client_message_id)
            } else if (event.data?.joined === true) {
              connection.send(frame)
            }
          })

          if (event.data?.joined === true && lastIncomingMessage?.id) {
            connection.send({
              type: 'receipt.delivered',
              conversation_id: activeId,
              through_message_id: lastIncomingMessage.id,
            })
            connection.send({
              type: 'receipt.read',
              conversation_id: activeId,
              through_message_id: lastIncomingMessage.id,
            })
          }

          const outstanding = pending
            .filter((frame) => pendingMessagesRef.current.has(frame.client_message_id))
            .map((frame) => ({
              id: frame.client_message_id,
              client_message_id: frame.client_message_id,
              from: 'me',
              text: frame.body,
              time: new Intl.DateTimeFormat('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date()),
              pending: true,
            }))

          setChats((current) => current.map((chat) => (
            String(chat.id) === String(activeId)
              ? {
                ...chat,
                unread: 0,
                messages: mergeMessageLists(items, mergeMessageLists(chat.messages, outstanding)),
              }
              : chat
          )))
          return
        }

        if (event.type === 'message.created' || event.type === 'message.updated') {
          const rawMessage = event.data?.message ?? event.data
          if (!rawMessage) return
          const incoming = chatService.mapMessage(rawMessage)
          if (incoming.client_message_id) {
            pendingMessagesRef.current.delete(incoming.client_message_id)
          }
          if (incoming.from === 'them' && incoming.id) {
            connection.send({
              type: 'receipt.delivered',
              conversation_id: activeId,
              through_message_id: incoming.id,
            })
            connection.send({
              type: 'receipt.read',
              conversation_id: activeId,
              through_message_id: incoming.id,
            })
            chatService.markConversationRead(activeId, incoming.id)
              .catch((error) => showNotice(error.message || 'Status baca gagal diperbarui.'))
          }
          setChats((current) => current.map((chat) => (
            String(chat.id) === String(event.conversation_id ?? activeId)
              ? {
                ...chat,
                preview: incoming.text || chat.preview,
                time: incoming.time,
                messages: mergeMessages(chat.messages, incoming),
              }
              : chat
          )))
          return
        }

        if (event.type === 'message.deleted') {
          const deleted = event.data?.message ?? event.data
          setChats((current) => current.map((chat) => (
            String(chat.id) === String(event.conversation_id ?? activeId)
              ? {
                ...chat,
                messages: chat.messages.filter((item) => String(item.id) !== String(deleted?.id)),
              }
              : chat
          )))
          return
        }

        if (event.type === 'error') {
          showNotice(event.error || 'Terjadi kesalahan pada koneksi chat.')
        }
      },
    })
    socketRef.current = connection

    return () => {
      isCurrent = false
      connection.disconnect()
      if (socketRef.current === connection) socketRef.current = null
      setSocketStatus('disconnected')
    }
  }, [activeId, isLoading])

  useEffect(() => {
    if (!activeId || isLoading) return undefined

    let isCurrent = true
    chatService.loadMessages(activeId)
      .then(async (page) => {
        if (!isCurrent) return
        setPagination((current) => ({ ...current, [activeId]: page.nextBeforeId }))
        setChats((current) => current.map((chat) => (
          String(chat.id) === String(activeId)
            ? {
              ...chat,
              messages: mergeMessageLists(page.items, chat.messages),
              unread: 0,
            }
            : chat
        )))
        const lastIncomingMessage = [...page.items].reverse()
          .find((item) => item.from === 'them')
        if (lastIncomingMessage) {
          await chatService.markConversationRead(activeId, lastIncomingMessage.id)
            .catch((error) => showNotice(error.message || 'Status baca gagal diperbarui.'))
        }
      })
      .catch((error) => {
        if (isCurrent) showNotice(error.message || 'Riwayat pesan gagal dimuat.')
      })

    return () => {
      isCurrent = false
    }
  }, [activeId, isLoading])

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
    setActiveId(chatId)
    setActiveView('chats')
    setShowConversations(false)
  }

  async function loadOlderMessages() {
    const beforeId = pagination[activeId]
    if (!beforeId || isLoadingOlder) return

    setIsLoadingOlder(true)
    try {
      const page = await chatService.loadMessages(activeId, { beforeId })
      setChats((current) => current.map((chat) => {
        if (String(chat.id) !== String(activeId)) return chat
        const existingIds = new Set(chat.messages.map((item) => String(item.id)))
        return {
          ...chat,
          messages: [
            ...page.items.filter((item) => !existingIds.has(String(item.id))),
            ...chat.messages,
          ],
        }
      }))
      setPagination((current) => ({ ...current, [activeId]: page.nextBeforeId }))
    } catch (error) {
      showNotice(error.message || 'Riwayat pesan lama gagal dimuat.')
    } finally {
      setIsLoadingOlder(false)
    }
  }

  async function createConversation(details) {
    try {
      const { conversation, created } = await chatService.createConversation(details)
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

  async function addContact(contactDetails) {
    try {
      await chatService.requestContact(contactDetails.phone)
      setSearch('')
      showNotice('Permintaan kontak berhasil dikirim.')
      chatService.listContactRequests()
        .then(({ outgoing }) => setOutgoingContactRequests(outgoing))
        .catch((error) => showNotice(error.message || 'Status permintaan kontak gagal diperbarui.'))
      return true
    } catch (error) {
      showNotice(error.message || 'Kontak gagal ditambahkan.')
      return false
    }
  }

  async function respondToContactRequest(userId, accepted) {
    try {
      await chatService.respondToContactRequest(userId, accepted)
      const [loadedContacts, loadedRequests] = await Promise.all([
        chatService.listContacts(),
        chatService.listContactRequests(),
      ])
      setContacts(loadedContacts)
      setContactRequests(loadedRequests.incoming)
      setOutgoingContactRequests(loadedRequests.outgoing)
      showNotice(accepted ? 'Permintaan kontak diterima.' : 'Permintaan kontak ditolak.')
    } catch (error) {
      showNotice(error.message || 'Permintaan kontak gagal diperbarui.')
    }
  }

  async function respondToGroupInvitation(invitationId, accepted) {
    try {
      await chatService.respondToGroupInvitation(invitationId, accepted)
      const loadedInvitations = await chatService.listGroupInvitations()
      setGroupInvitations(loadedInvitations)
      if (accepted) {
        const loadedChats = await chatService.listConversations()
        setChats(loadedChats)
        if (!loadedChats.some((chat) => String(chat.id) === String(activeId))) {
          setActiveId(loadedChats.find((chat) => !chat.archived)?.id ?? null)
        }
      }
      showNotice(accepted ? 'Undangan grup diterima.' : 'Undangan grup ditolak.')
    } catch (error) {
      showNotice(error.message || 'Undangan grup gagal diperbarui.')
    }
  }

  async function inviteGroupMember(userId) {
    if (!activeChat || activeChat.status !== 'group') return
    try {
      await chatService.inviteToGroup(activeChat.id, userId)
      showNotice('Undangan grup berhasil dikirim.')
      return true
    } catch (error) {
      showNotice(error.message || 'Anggota gagal diundang.')
      return false
    }
  }

  async function archiveChat(chatId) {
    const remainingChats = visibleChats.filter((chat) => chat.id !== chatId)
    try {
      const archivedChat = await chatService.archiveConversation(chatId)
      setChats((current) => current.map((chat) => (
        chat.id === chatId ? { ...chat, ...archivedChat } : chat
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
        chat.id === chatId ? { ...chat, ...restoredChat } : chat
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

    if (attachments.length > 0) {
      throw new Error('Backend saat ini hanya mendukung pesan teks; lampiran belum tersedia.')
    }
    const frame = {
      type: 'message.send',
      conversation_id: activeId,
      client_message_id: crypto.randomUUID(),
      message_type: 'text',
      body: text,
    }
    const time = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date())
    pendingMessagesRef.current.set(frame.client_message_id, frame)
    socketRef.current?.send(frame)
    setChats((current) => current.map((chat) => (
      String(chat.id) === String(activeId)
        ? {
          ...chat,
          preview: text,
          messages: mergeMessages(chat.messages, {
            id: frame.client_message_id,
            client_message_id: frame.client_message_id,
            from: 'me',
            text,
            time,
            pending: true,
          }),
          time,
        }
        : chat
    )))
    setMessage('')
  }

  async function selectContact(contact) {
    try {
      const existingConversation = chatService.findDirectConversation(chats, contact.id)
      if (existingConversation) {
        setChats((current) => current.map((chat) => (
          String(chat.id) === String(existingConversation.id)
            ? {
              ...chat,
              name: contact.name,
              initials: contact.initials,
              color: contact.color,
            }
            : chat
        )))
        await selectChat(existingConversation.id)
        return
      }

      const { conversation } = await chatService.createConversation({
        type: 'direct',
        memberIds: [contact.id],
        contact,
      })
      setChats((current) => (
        current.some((chat) => String(chat.id) === String(conversation.id))
          ? current.map((chat) => String(chat.id) === String(conversation.id) ? conversation : chat)
          : [conversation, ...current]
      ))
      await selectChat(conversation.id)
    } catch (error) {
      showNotice(error.message || 'Percakapan dengan kontak gagal dibuka.')
    }
  }

  return (
    <main
      className={`app-shell${activeSidePanel ? ' side-panel-open' : ''}`}
      data-theme={theme}
    >
      <ChatSidebar
        chats={chats}
        contacts={contacts}
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
        profileInitials={currentProfileInitials}
        onFilterChange={setFilter}
        onViewChange={(view) => {
          setActiveView(view)
          setShowConversations(true)
        }}
        onNewChat={() => setIsNewChatOpen(true)}
        onAddContact={addContact}
        contactRequests={contactRequests}
        outgoingContactRequests={outgoingContactRequests}
        groupInvitations={groupInvitations}
        onRespondToContactRequest={respondToContactRequest}
        onRespondToGroupInvitation={respondToGroupInvitation}
        onRetryLoad={retryLoadConversations}
        onRestoreChat={restoreChat}
        onClearFilter={() => {
          setSearch('')
          setFilter('Semua')
        }}
        onSearchChange={setSearch}
        onSelectChat={selectChat}
        onSelectContact={selectContact}
        onProfileClick={togglePersonalProfile}
        onSettingsClick={() => setActiveSidePanel((panel) => panel === 'settings' ? null : 'settings')}
      />
      <ChatWindow
        key={activeId ?? 'empty-chat'}
        chat={activeChat}
        message={message}
        onBack={() => setShowConversations(true)}
        onProfileClick={() => setActiveSidePanel((panel) => panel === 'contact' ? null : 'contact')}
        onPersonalProfileClick={togglePersonalProfile}
        onSettingsClick={() => setActiveSidePanel((panel) => panel === 'settings' ? null : 'settings')}
        onArchiveChat={() => activeChat && archiveChat(activeChat.id)}
        onNotice={showNotice}
        readReceiptsEnabled={readReceiptsEnabled}
        socketStatus={socketStatus}
        isPersonalProfileExpanded={activeSidePanel === 'profile'}
        isSettingsExpanded={activeSidePanel === 'settings'}
        profileInitials={currentProfileInitials}
        hasOlderMessages={Boolean(pagination[activeId])}
        isLoadingOlder={isLoadingOlder}
        onLoadOlder={loadOlderMessages}
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
              onInviteMember={inviteGroupMember}
            />
          ) : activeSidePanel === 'profile' ? (
            <PersonalProfile
              profile={userProfile}
              isLoading={isProfileLoading}
              loadError={profileLoadError}
              onRetry={retryLoadProfile}
              onClose={() => setActiveSidePanel(null)}
              onLogout={onLogout}
            />
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
  const [memberIdsText, setMemberIdsText] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState('direct')
  const [formError, setFormError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const memberIds = memberIdsText.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (/^\d+$/.test(value) ? Number(value) : value))
    if (type === 'direct' && memberIds.length !== 1) {
      setFormError('Direct chat harus memiliki tepat satu ID pengguna.')
      return
    }
    setFormError('')
    onCreate({ type, memberIds, title })
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
          <label htmlFor="new-chat-members">
            {type === 'direct' ? 'ID pengguna' : 'ID anggota'}
          </label>
          <input
            autoFocus
            id="new-chat-members"
            value={memberIdsText}
            onChange={(event) => setMemberIdsText(event.target.value)}
            maxLength={200}
            placeholder={type === 'direct' ? 'Contoh: 24' : 'Contoh: 24, 31'}
            required
          />
          <label className="new-chat-type-label" htmlFor="new-chat-type">Jenis percakapan</label>
          <select id="new-chat-type" value={type} onChange={(event) => {
            setType(event.target.value)
            setFormError('')
          }}>
            <option value="direct">Kontak</option>
            <option value="group">Grup</option>
          </select>
          {type === 'group' && (
            <>
              <label htmlFor="new-chat-title">Nama grup (opsional)</label>
              <input
                id="new-chat-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                placeholder="Contoh: Tim Produk"
              />
            </>
          )}
          <p>Gunakan ID pengguna. Chat langsung hanya dapat dibuat dengan kontak yang sudah diterima.</p>
          {formError && <p className="login-error" role="alert">{formError}</p>}
          <div className="chat-modal-actions">
            <button type="button" onClick={onClose}>Batal</button>
            <button type="submit" disabled={!memberIdsText.trim()}>Buat percakapan</button>
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
