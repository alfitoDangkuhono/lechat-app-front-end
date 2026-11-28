import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChatSidebar from './ChatSidebar'
import ChatAvatar from './ChatAvatar'
import ChatIcon from './ChatIcon'
import ChatWindow from './ChatWindow'
import ContactDetails from '../../contact/components/ContactDetails'
import {
  getCachedCurrentUserProfile,
  getCurrentUserProfile,
  PersonalProfile,
  profileInitials,
  saveCachedCurrentUserProfile,
} from '../../profile'
import { SettingsPanel, useChatPreferences, useTheme } from '../../settings'
import { chatService } from '../services/chatService'
import { connectWebSocket } from '../services/webSocketService'
import {
  checkIdentityStatus,
  clearGroupKeyCache,
  createAndPublishGroupKey,
  debugDirectMessage,
  decryptDirectMessage,
  decryptGroupMessage,
  deleteEncryptedMessages,
  encryptDirectMessage,
  encryptGroupMessage,
  getOrFetchGroupKey,
  publishIdentity,
  rewrapGroupKeyForMember,
  saveEncryptedMessage,
  trustPeerKey,
} from '../services/e2eeService'
import '../../../App.css'

const SEND_RATE_LIMIT_MAX = 30
const SEND_RATE_LIMIT_WINDOW_MS = 10_000
const MAX_PLAINTEXT_BYTES = 49_136
const WS_ERROR_MESSAGES = {
  rate_limited: 'Pesan terlalu cepat dikirim. Tunggu sebentar lalu coba lagi.',
  payload_too_large: 'Pesan terlalu panjang. Pisah menjadi beberapa pesan lebih pendek.',
  conflict: 'Konflik pesan terdeteksi (ID pesan sudah dipakai dengan isi berbeda).',
  encryption_required: 'Pesan direct wajib terenkripsi.',
  group_encryption_unsupported: 'Pesan grup belum mendukung enkripsi.',
  invalid_public_key: 'Public key tidak valid.',
  invalid_reply: 'Pesan yang dibalas tidak valid.',
  forbidden: 'Akses ke percakapan ditolak.',
  not_found: 'Percakapan atau pesan tidak ditemukan.',
  bad_request: 'Permintaan tidak valid.',
}

function friendlyWebSocketError(code) {
  return WS_ERROR_MESSAGES[code] ?? `Koneksi chat menolak permintaan (${code ?? 'unknown_error'}).`
}

function mergeMessages(current, incoming) {
  const index = current.findIndex((item) => (
    (
      item.id !== undefined
      && item.id !== null
      && incoming.id !== undefined
      && incoming.id !== null
      && String(item.id) === String(incoming.id)
    )
    || (
      item.client_message_id
      && item.client_message_id === incoming.client_message_id
    )
  ))
  if (index < 0) return [...current, incoming]
  return current.map((item, itemIndex) => {
    if (itemIndex !== index) return item

    const isPending = item.pending === true && incoming.pending === true
    const merged = incoming.pending === true && item.pending !== true
      ? { ...incoming, ...item }
      : { ...item, ...incoming }
    return { ...merged, pending: isPending }
  })
}

function mergeMessageLists(primary, secondary) {
  return secondary.reduce((messages, item) => mergeMessages(messages, item), primary)
}

function updateOutgoingReceipt(messages, throughMessageId, receiptStatus) {
  const cursorIndex = messages.findIndex((item) => String(item.id) === String(throughMessageId))
  if (cursorIndex < 0) return messages

  const statusRank = { sent: 0, delivered: 1, read: 2 }
  return messages.map((item, index) => {
    if (index > cursorIndex || item.from !== 'me') return item
    const currentStatus = item.receiptStatus ?? 'sent'
    if (statusRank[currentStatus] >= statusRank[receiptStatus]) return item
    return { ...item, receiptStatus }
  })
}

function resolveCanonicalUsernames(messages) {
  let from = null
  let to = null
  for (const item of messages ?? []) {
    if (typeof item.from_username !== 'string' || !item.from_username) continue
    if (typeof item.to_username !== 'string' || !item.to_username) continue
    if (item.from === 'me') {
      from ??= item.from_username
      to ??= item.to_username
    } else {
      to ??= item.from_username
      from ??= item.to_username
    }
    if (from && to) break
  }
  return { from, to }
}

async function decodeMessages(chat, rawMessages, currentUsername) {
  const messages = []
  const acknowledgedIds = []
  let peerWarning = null

  for (const rawMessage of rawMessages) {
    if (chat.status === 'group') {
      if (Number(rawMessage.encryption_version) !== 1) {
        messages.push(chatService.mapMessage({ ...rawMessage, security: 'legacy' }))
        continue
      }

      if (rawMessage.deleted_at || rawMessage.is_deleted) {
        messages.push({
          ...chatService.mapMessage({ ...rawMessage, body: '', text: '', security: 'e2ee' }),
          from: rawMessage.from_username === currentUsername ? 'me' : 'them',
        })
        continue
      }

      if (typeof rawMessage.ciphertext !== 'string' || !rawMessage.ciphertext
        || typeof rawMessage.iv !== 'string' || !rawMessage.iv) {
        messages.push({
          ...chatService.mapMessage({ ...rawMessage, body: '', text: '', security: 'e2ee' }),
          from: rawMessage.from_username === currentUsername ? 'me' : 'them',
          decryptFailed: true,
          decryptError: 'Isi pesan terenkripsi grup tidak lengkap.',
        })
        continue
      }

      try {
        const text = await decryptGroupMessage({
          message: rawMessage,
          conversationId: chat.id,
          currentUsername,
        })
        const mappedMessage = chatService.mapMessage({
          ...rawMessage,
          body: text,
          text,
          security: 'e2ee',
        })
        messages.push({
          ...mappedMessage,
          from: rawMessage.from_username === currentUsername ? 'me' : 'them',
        })
        if (rawMessage.from_username !== currentUsername && rawMessage.id !== undefined) {
          acknowledgedIds.push(rawMessage.id)
        }
      } catch (error) {
        messages.push({
          ...chatService.mapMessage({
            ...rawMessage,
            body: '',
            text: '',
            security: 'e2ee',
          }),
          from: rawMessage.from_username === currentUsername ? 'me' : 'them',
          decryptFailed: true,
          decryptError: error.message || 'Pesan grup terenkripsi tidak dapat dibuka di perangkat ini.',
        })
      }
      continue
    }

    if (Number(rawMessage.encryption_version) !== 1) {
      messages.push(chatService.mapMessage({ ...rawMessage, security: 'legacy' }))
      continue
    }

    if (rawMessage.deleted_at || rawMessage.is_deleted) {
      if (rawMessage.id !== undefined) {
        deleteEncryptedMessages(currentUsername, chat.id, [rawMessage.id]).catch(() => {})
      }
      messages.push({
        ...chatService.mapMessage({ ...rawMessage, body: '', text: '', security: 'e2ee' }),
        from: rawMessage.from_username === currentUsername ? 'me' : 'them',
      })
      continue
    }

    if (typeof rawMessage.ciphertext !== 'string' || !rawMessage.ciphertext
      || typeof rawMessage.iv !== 'string' || !rawMessage.iv) {
      messages.push({
        ...chatService.mapMessage({ ...rawMessage, body: '', text: '', security: 'e2ee' }),
        from: rawMessage.from_username === currentUsername ? 'me' : 'them',
        decryptFailed: true,
        decryptError: 'Isi pesan terenkripsi tidak lengkap.',
      })
      continue
    }

    try {
      await saveEncryptedMessage(currentUsername, chat.id, rawMessage)
      const text = await decryptDirectMessage({
        message: rawMessage,
        currentUsername,
        peerUserId: chat.peerUserId,
        peerUsername: chat.peerUsername,
      })
      const mappedMessage = chatService.mapMessage({
        ...rawMessage,
        body: text,
        text,
        security: 'e2ee',
      })
      messages.push({
        ...mappedMessage,
        from: rawMessage.from_username === currentUsername ? 'me' : 'them',
      })
      if (rawMessage.from_username !== currentUsername && rawMessage.id !== undefined) {
        acknowledgedIds.push(rawMessage.id)
      }
    } catch (error) {
      if (error?.peer && !peerWarning) peerWarning = error.peer
      if (!error?.peer) {
        console.warn('Dekripsi pesan E2EE gagal:', {
          from_username: rawMessage.from_username,
          to_username: rawMessage.to_username,
          currentUsername,
          peerUsername: chat.peerUsername,
          sender_id: rawMessage.sender_id,
          peerUserId: chat.peerUserId,
          error: error?.name ?? String(error),
          errorMessage: error?.message ?? null,
        })
      }
      messages.push({
        ...chatService.mapMessage({ ...rawMessage, body: '', text: '', security: 'e2ee' }),
        from: rawMessage.from_username === currentUsername ? 'me' : 'them',
        decryptFailed: true,
        decryptErrorCode: error?.code ?? null,
        decryptError: error?.peer
          ? error.message
          : (error instanceof DOMException || !error?.message
            ? 'Pesan terenkripsi tidak dapat dibuka di perangkat ini.'
            : error.message),
      })
    }
  }

  if (acknowledgedIds.length) {
    await chatService.acknowledgeMessages(chat.id, acknowledgedIds).catch((error) => {
      console.warn('ACK pesan terenkripsi gagal:', error?.message ?? error)
    })
  }
  return { messages, peerWarning }
}

async function playNotificationSound(audioContext) {
  if (!audioContext || audioContext.state === 'closed') return

  if (audioContext.state !== 'running') {
    try {
      await audioContext.resume()
    } catch (error) {
      console.warn('Audio notifikasi gagal diputar:', error)
      return
    }
  }
  if (audioContext.state !== 'running') return

  const oscillator = audioContext.createOscillator()
  const volume = audioContext.createGain()
  const now = audioContext.currentTime

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, now)
  oscillator.frequency.setValueAtTime(1174.66, now + 0.12)
  volume.gain.setValueAtTime(0.0001, now)
  volume.gain.exponentialRampToValueAtTime(0.3, now + 0.02)
  volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
  oscillator.connect(volume)
  volume.connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.34)
}

function Dashboard({ onLogout }) {
  const [chats, setChats] = useState([])
  const [contacts, setContacts] = useState([])
  const [groupMemberState, setGroupMemberState] = useState(null)
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [isLoadingGroupContacts, setIsLoadingGroupContacts] = useState(false)
  const [groupContactsError, setGroupContactsError] = useState('')
  const [contactRequests, setContactRequests] = useState([])
  const [outgoingContactRequests, setOutgoingContactRequests] = useState([])
  const [groupInvitations, setGroupInvitations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [socketStatus, setSocketStatus] = useState('disconnected')
  const [pagination, setPagination] = useState({})
  const [loadingOlderChatIds, setLoadingOlderChatIds] = useState(() => new Set())
  const [loadingHistoryChatId, setLoadingHistoryChatId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [message, setMessage] = useState('')
  const [showConversations, setShowConversations] = useState(true)
  const [activeView, setActiveView] = useState('chats')
  const [activeSidePanel, setActiveSidePanel] = useState(null)
  const [userProfile, setUserProfile] = useState(() => getCachedCurrentUserProfile())
  const currentUsername = userProfile?.username ?? ''
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [profileLoadError, setProfileLoadError] = useState('')
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0)
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [isMediaOpen, setIsMediaOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [securityWarning, setSecurityWarning] = useState(null)
  const [identityConflict, setIdentityConflict] = useState(null)
  const [keyTrustRevision, setKeyTrustRevision] = useState(0)
  const [groupKeyRefreshRev, setGroupKeyRefreshRev] = useState(0)
  const noticeTimer = useRef(null)
  const avatarRefreshPendingRef = useRef(false)
  const socketRef = useRef(null)
  const chatsRef = useRef(chats)
  const currentUsernameRef = useRef(currentUsername)
  const notificationAudioRef = useRef(null)
  const pendingMessagesRef = useRef(new Map())
  const sendTimestampsRef = useRef([])
  const notifiedMessagesRef = useRef(new Set())
  const loadingOlderChatIdsRef = useRef(new Set())
  const showConversationsRef = useRef(showConversations)
  const { theme, toggleTheme } = useTheme()
  const {
    notificationsEnabled,
    readReceiptsEnabled,
    messageFontSize,
    messageFontFamily,
    toggleNotifications,
    toggleReadReceipts,
    setMessageFontSize,
    setMessageFontFamily,
  } = useChatPreferences()
  const notificationsEnabledRef = useRef(notificationsEnabled)
  const activeChat = chats.find((chat) => chat.id === activeId)
  const isLoadingOlder = activeId !== null
    && loadingOlderChatIds.has(String(activeId))
  const isLoadingChatHistory = activeId !== null
    && String(loadingHistoryChatId) === String(activeId)
  const visibleChats = chats.filter((chat) => !chat.archived)
  const archivedChats = chats.filter((chat) => chat.archived)
  const currentProfileInitials = profileInitials(userProfile)
  const profileAvatarUrl = userProfile?.avatar_url ?? ''

  const requestAvatarRefresh = useCallback(() => {
    if (avatarRefreshPendingRef.current) return
    avatarRefreshPendingRef.current = true
    setProfileLoadError('')
    setIsProfileLoading(true)
    setProfileLoadAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    showConversationsRef.current = showConversations
  }, [showConversations])

  useEffect(() => {
    chatsRef.current = chats
    currentUsernameRef.current = currentUsername
  }, [chats, currentUsername])

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled
  }, [notificationsEnabled])

  useEffect(() => {
    function enableNotificationAudio() {
      if (notificationAudioRef.current) {
        if (notificationAudioRef.current.state === 'suspended') {
          notificationAudioRef.current.resume().catch((error) => {
            console.warn('Audio notifikasi gagal diaktifkan:', error)
          })
        }
        return
      }

      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContextConstructor) return

      const audioContext = new AudioContextConstructor()
      notificationAudioRef.current = audioContext
      audioContext.resume().catch((error) => {
        console.warn('Audio notifikasi gagal diaktifkan:', error)
      })
    }

    window.addEventListener('pointerdown', enableNotificationAudio)
    window.addEventListener('keydown', enableNotificationAudio)
    return () => {
      window.removeEventListener('pointerdown', enableNotificationAudio)
      window.removeEventListener('keydown', enableNotificationAudio)
      if (notificationAudioRef.current) {
        notificationAudioRef.current.close().catch((error) => {
          console.warn('Audio notifikasi gagal dihentikan:', error)
        })
      }
    }
  }, [])

  function showNotice(text) {
    window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500)
  }

  function assertSendRateLimit() {
    const now = Date.now()
    sendTimestampsRef.current = sendTimestampsRef.current
      .filter((timestamp) => now - timestamp < SEND_RATE_LIMIT_WINDOW_MS)
    if (sendTimestampsRef.current.length >= SEND_RATE_LIMIT_MAX) {
      const retryInSeconds = Math.max(1, Math.ceil(
        (SEND_RATE_LIMIT_WINDOW_MS - (now - sendTimestampsRef.current[0])) / 1000,
      ))
      throw new Error(`Pesan terlalu cepat dikirim. Tunggu ${retryInSeconds} detik lalu coba lagi.`)
    }
  }

  function recordSendTimestamp() {
    sendTimestampsRef.current.push(Date.now())
  }

  function markPendingMessagesFailed() {
    const failedEntries = [...pendingMessagesRef.current.entries()]
      .filter(([, item]) => !item.failed)
    if (!failedEntries.length) return
    for (const [, item] of failedEntries) item.failed = true

    const failedIdsByConversation = new Map()
    for (const [clientMessageId, item] of failedEntries) {
      const conversationId = String(item.frame.conversation_id)
      const ids = failedIdsByConversation.get(conversationId) ?? new Set()
      ids.add(String(clientMessageId))
      failedIdsByConversation.set(conversationId, ids)
    }

    setChats((current) => current.map((chat) => {
      const failedIds = failedIdsByConversation.get(String(chat.id))
      if (!failedIds?.size) return chat
      return {
        ...chat,
        messages: chat.messages.map((item) => (
          item.pending === true && failedIds.has(String(item.client_message_id ?? item.id))
            ? { ...item, pending: false, failed: true }
            : item
        )),
      }
    }))
  }

  function retryPendingMessage(clientMessageId) {
    const entry = pendingMessagesRef.current.get(String(clientMessageId))
    if (!entry) {
      showNotice('Pesan tidak dapat dikirim ulang. Silakan tulis ulang pesan Anda.')
      return
    }
    const sent = socketRef.current?.send(entry.frame)
    if (sent === false) {
      showNotice('Koneksi belum siap. Pesan akan dikirim otomatis setelah koneksi tersambung.')
    }
    entry.failed = false
    setChats((current) => current.map((chat) => ({
      ...chat,
      messages: chat.messages.map((item) => (
        String(item.client_message_id ?? item.id) === String(clientMessageId)
          ? { ...item, pending: true, failed: false }
          : item
      )),
    })))
  }

  function togglePersonalProfile() {
    if (activeSidePanel === 'profile') {
      setActiveSidePanel(null)
      return
    }

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

  async function loadGroupContacts() {
    if (contactsLoaded || isLoadingGroupContacts) return

    setIsLoadingGroupContacts(true)
    setGroupContactsError('')
    try {
      const loadedContacts = await chatService.listContacts()
      setContacts(loadedContacts)
      setContactsLoaded(true)
    } catch (error) {
      setGroupContactsError(error.message || 'Kontak gagal dimuat.')
    } finally {
      setIsLoadingGroupContacts(false)
    }
  }

  async function retryLoadGroupMembers() {
    if (!activeChat || activeChat.status !== 'group') return

    const conversationId = activeChat.id
    setGroupMemberState({
      conversationId,
      members: groupMemberState?.conversationId === conversationId
        ? groupMemberState.members
        : [],
      error: '',
      loading: true,
    })
    try {
      const members = await chatService.listGroupMembers(conversationId)
      setGroupMemberState({ conversationId, members, error: '', loading: false })
      return members
    } catch (error) {
      setGroupMemberState({
        conversationId,
        members: [],
        error: error.message || 'Anggota grup gagal dimuat.',
        loading: false,
      })
      return null
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
        setContactsLoaded(true)
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
    if (activeChat?.status !== 'group') return undefined

    let isCurrent = true
    chatService.listGroupMembers(activeChat.id)
      .then((members) => {
        if (isCurrent) {
          setGroupMemberState({
            conversationId: activeChat.id,
            members,
            error: '',
            loading: false,
          })
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setGroupMemberState({
            conversationId: activeChat.id,
            members: [],
            error: error.message || 'Anggota grup gagal dimuat.',
            loading: false,
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [activeChat?.id, activeChat?.status])

  useEffect(() => {
    let isCurrent = true
    getCurrentUserProfile()
      .then((profile) => {
        if (!isCurrent) return
        setUserProfile(profile)
        saveCachedCurrentUserProfile(profile)
      })
      .catch((error) => {
        if (isCurrent) {
          setProfileLoadError(error.message || 'Profil gagal dimuat.')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsProfileLoading(false)
          avatarRefreshPendingRef.current = false
        }
      })

    return () => {
      isCurrent = false
    }
  }, [profileLoadAttempt])

  useEffect(() => {
    if (!currentUsername) return undefined

    let isCurrent = true
    checkIdentityStatus(currentUsername)
      .then((status) => {
        if (!isCurrent) return
        if (status?.conflict) {
          setIdentityConflict({ username: status.username })
        } else {
          setIdentityConflict(null)
        }
      })
      .catch(() => {})

    return () => {
      isCurrent = false
    }
  }, [currentUsername, keyTrustRevision])

  useEffect(() => {
    if (!profileAvatarUrl) return undefined

    const expiresIn = Number.isFinite(userProfile?.avatar_url_expires_in)
      ? userProfile.avatar_url_expires_in
      : 900
    const refreshDelay = profileLoadError
      ? 30_000
      : Math.max(1000, (expiresIn - 30) * 1000)
    const refreshTimer = window.setTimeout(requestAvatarRefresh, refreshDelay)

    return () => window.clearTimeout(refreshTimer)
  }, [
    profileAvatarUrl,
    userProfile?.avatar_url_expires_in,
    profileLoadError,
    profileLoadAttempt,
    requestAvatarRefresh,
  ])

  useEffect(() => {
    if (isLoading) return undefined

    let isCurrent = true
    const connection = connectWebSocket({
      conversationId: activeId,
      onStatus: setSocketStatus,
      async onEvent(event) {
        if (!isCurrent) return

        const eventConversationId = event.conversation_id
          ?? event.data?.conversation_id
          ?? event.data?.message?.conversation_id
          ?? (activeId ? activeId : null)
        const isViewingConversation = activeId !== null
          && eventConversationId !== null
          && String(eventConversationId) === String(activeId)
          && !(window.matchMedia('(max-width: 760px)').matches && showConversationsRef.current)

        if (event.type === 'conversation.history') {
          if (!activeId) return
          const currentChat = chatsRef.current.find((chat) => String(chat.id) === String(activeId))
          if (!currentChat) return
          const { messages: decodedItems, peerWarning } = await decodeMessages(
            currentChat,
            event.data?.items ?? [],
            currentUsernameRef.current,
          )
          if (peerWarning) setSecurityWarning(peerWarning)
          const items = decodedItems.reverse()
          setPagination((current) => ({
            ...current,
            [activeId]: event.data?.next_before_id ?? null,
          }))
          const lastIncomingMessage = [...items].reverse().find((item) => item.from === 'them')
          const pending = [...pendingMessagesRef.current.values()]
            .filter((item) => String(item.frame.conversation_id) === String(activeId))
          const confirmedIds = new Set(items.map((item) => item.client_message_id).filter(Boolean))

          pending.forEach((item) => {
            const { frame } = item
            if (confirmedIds.has(frame.client_message_id)) {
              pendingMessagesRef.current.delete(frame.client_message_id)
            } else if (event.data?.joined === true && !item.failed) {
              connection.send(frame)
            }
          })

          if (event.data?.joined === true && lastIncomingMessage?.id) {
            connection.send({
              type: 'receipt.delivered',
              conversation_id: activeId,
              through_message_id: lastIncomingMessage.id,
            })
            if (isViewingConversation) {
              connection.send({
                type: 'receipt.read',
                conversation_id: activeId,
                through_message_id: lastIncomingMessage.id,
              })
            }
          }

          const outstanding = pending
            .filter(({ frame }) => pendingMessagesRef.current.has(frame.client_message_id))
            .map(({ frame, text, failed }) => ({
              id: frame.client_message_id,
              client_message_id: frame.client_message_id,
              from: 'me',
              text,
              time: new Intl.DateTimeFormat('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date()),
              pending: !failed,
              failed: Boolean(failed),
            }))

          setChats((current) => current.map((chat) => (
            String(chat.id) === String(activeId)
              ? {
                ...chat,
                unread: isViewingConversation ? 0 : chat.unread,
                messages: mergeMessageLists(items, mergeMessageLists(chat.messages, outstanding)),
              }
              : chat
          )))
          return
        }

        if (event.type === 'receipt.read' || event.type === 'receipt.delivered') {
          const receipt = event.data?.receipt ?? event.data ?? {}
          const receiptConversationId = event.conversation_id
            ?? receipt.conversation_id
            ?? activeId
          const throughMessageId = receipt.through_message_id
            ?? receipt.message_id
            ?? event.through_message_id
          if (receiptConversationId === null || !throughMessageId) return

          const receiptStatus = event.type === 'receipt.read' ? 'read' : 'delivered'
          setChats((current) => current.map((chat) => (
            String(chat.id) === String(receiptConversationId)
              ? {
                ...chat,
                messages: updateOutgoingReceipt(
                  chat.messages,
                  throughMessageId,
                  receiptStatus,
                ),
              }
              : chat
          )))
          return
        }

        if (event.type === 'message.created' || event.type === 'message.updated') {
          const rawMessage = event.data?.message ?? event.data
          if (!rawMessage || eventConversationId === null) return
          const targetChat = chatsRef.current.find((chat) => (
            String(chat.id) === String(eventConversationId)
          ))
          if (!targetChat) return
          const { messages: decodedMessages, peerWarning } = await decodeMessages(
            targetChat,
            [rawMessage],
            currentUsernameRef.current,
          )
          if (peerWarning) setSecurityWarning(peerWarning)
          const [incoming] = decodedMessages
          if (!incoming) return
          if (incoming.client_message_id) {
            pendingMessagesRef.current.delete(incoming.client_message_id)
          }
          if (isViewingConversation && incoming.from === 'them' && incoming.id) {
            connection.send({
              type: 'receipt.delivered',
              conversation_id: eventConversationId,
              through_message_id: incoming.id,
            })
            connection.send({
              type: 'receipt.read',
              conversation_id: eventConversationId,
              through_message_id: incoming.id,
            })
            chatService.markConversationRead(eventConversationId, incoming.id)
              .catch((error) => showNotice(error.message || 'Status baca gagal diperbarui.'))
          }
          const messageKey = `${eventConversationId}:${incoming.id}`
          const shouldNotify = event.type === 'message.created'
            && incoming.from === 'them'
            && incoming.id
            && !notifiedMessagesRef.current.has(messageKey)
          if (shouldNotify) {
            notifiedMessagesRef.current.add(messageKey)
            if (notifiedMessagesRef.current.size > 100) {
              const oldestKey = notifiedMessagesRef.current.values().next().value
              notifiedMessagesRef.current.delete(oldestKey)
            }
          }
          setChats((current) => {
            const conversationIndex = current.findIndex((chat) => (
              String(chat.id) === String(eventConversationId)
            ))
            if (conversationIndex < 0) return current

            const conversation = current[conversationIndex]
            const isDuplicate = conversation.messages.some((item) => (
              String(item.id) === String(incoming.id)
              || (
                incoming.client_message_id
                && item.client_message_id === incoming.client_message_id
              )
            ))
            const updatedConversation = {
              ...conversation,
              preview: incoming.decryptFailed
                ? 'Pesan terenkripsi'
                : incoming.text || conversation.preview,
              time: incoming.time,
              unread: event.type === 'message.created'
                && incoming.from === 'them'
                && incoming.id
                && !isViewingConversation
                && !isDuplicate
                ? conversation.unread + 1
                : conversation.unread,
              messages: mergeMessages(conversation.messages, incoming),
            }

            return conversationIndex === 0
              ? [updatedConversation, ...current.slice(1)]
              : [
                updatedConversation,
                ...current.slice(0, conversationIndex),
                ...current.slice(conversationIndex + 1),
              ]
          })
          if (shouldNotify && notificationsEnabledRef.current) {
            void playNotificationSound(notificationAudioRef.current)
            showNotice(`${incoming.author || 'Pesan baru'}: ${incoming.text || 'Pesan baru'}`)
          }
          return
        }

        if (event.type === 'message.deleted') {
          const deleted = event.data?.message ?? event.data
          const deletedConversationId = event.conversation_id ?? activeId
          if (deleted?.id && deletedConversationId) {
            deleteEncryptedMessages(currentUsernameRef.current, deletedConversationId, [deleted.id])
              .catch(() => {})
          }
          setChats((current) => current.map((chat) => (
            String(chat.id) === String(deletedConversationId)
              ? {
                ...chat,
                messages: chat.messages.filter((item) => String(item.id) !== String(deleted?.id)),
              }
              : chat
          )))
          return
        }

        if (event.type === 'group_key.created') {
          const keyConversationId = event.conversation_id
            ?? event.data?.conversation_id
            ?? activeId
          const keyVersion = event.data?.key_version
          if (!keyConversationId || !keyVersion || Number(keyVersion) < 1) return

          // Kontrak §8: ambil wrapped key versi baru via REST lalu cache di perangkat.
          getOrFetchGroupKey({
            conversationId: keyConversationId,
            keyVersion: Number(keyVersion),
            currentUsername: currentUsernameRef.current,
          })
            .then((groupKey) => {
              if (!groupKey) {
                console.warn(
                  `group_key.created: tidak ada kunci versi ${keyVersion} untuk account ini pada ${keyConversationId}.`,
                )
                return
              }
              // Kunci versi baru sudah ter-cache. Segarkan riwayat agar pesan yang
              // tadinya gagal didekripsi ikut ter-render.
              if (activeId !== null && String(activeId) === String(keyConversationId)) {
                setGroupKeyRefreshRev((rev) => rev + 1)
              }
            })
            .catch((error) => {
              if (error?.response?.status === 403) {
                clearGroupKeyCache(currentUsernameRef.current, keyConversationId).catch(() => {})
              }
              console.warn('Menarik kunci grup setelah group_key.created gagal:', error?.message ?? error)
            })
          return
        }

        if (event.type === 'error') {
          showNotice(friendlyWebSocketError(event.error))
          markPendingMessagesFailed()
        }
      },
      onEventError(error) {
        if (error?.peer) setSecurityWarning(error.peer)
        showNotice(error?.message || 'Pesan gagal diproses.')
      },
    })
    socketRef.current = connection

    return () => {
      isCurrent = false
      connection.disconnect()
      if (socketRef.current === connection) socketRef.current = null
      setSocketStatus('disconnected')
    }
  }, [activeId, isLoading, keyTrustRevision])

  useEffect(() => {
    if (!activeId || isLoading) return undefined

    let isCurrent = true
    Promise.resolve().then(() => {
      if (isCurrent) setLoadingHistoryChatId(activeId)
    })
    chatService.loadMessages(activeId)
      .then(async (page) => {
        if (!isCurrent) return
        const selectedChat = chatsRef.current.find((chat) => String(chat.id) === String(activeId))
        if (!selectedChat) return
        const { messages: decodedItems, peerWarning } = await decodeMessages(
          selectedChat,
          page.items,
          currentUsername,
        )
        if (!isCurrent) return
        if (peerWarning) setSecurityWarning(peerWarning)
        const items = decodedItems
        setPagination((current) => ({ ...current, [activeId]: page.nextBeforeId }))
        setChats((current) => current.map((chat) => {
          if (String(chat.id) !== String(activeId)) return chat
          const merged = mergeMessageLists(items, chat.messages)
          const lastMsg = merged[merged.length - 1]
          const lastPreview = lastMsg
            ? (lastMsg.deleted_at || lastMsg.is_deleted
              ? 'Pesan telah dihapus'
              : lastMsg.text || lastMsg.body || (lastMsg.decryptFailed ? 'Pesan terenkripsi' : chat.preview))
            : chat.preview
          const lastTime = lastMsg?.time || chat.time
          return {
            ...chat,
            messages: merged,
            preview: lastPreview,
            time: lastTime,
            unread: 0,
          }
        }))
        const lastIncomingMessage = [...items].reverse()
          .find((item) => item.from === 'them')
        if (lastIncomingMessage) {
          await chatService.markConversationRead(activeId, lastIncomingMessage.id)
            .catch((error) => showNotice(error.message || 'Status baca gagal diperbarui.'))
        }
      })
      .catch((error) => {
        if (isCurrent) {
          if (error?.peer) setSecurityWarning(error.peer)
          showNotice(error.message || 'Riwayat pesan gagal dimuat.')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingHistoryChatId((current) => (
            String(current) === String(activeId) ? null : current
          ))
        }
      })

    return () => {
      isCurrent = false
    }
  }, [
    activeId,
    currentUsername,
    isLoading,
    keyTrustRevision,
    groupKeyRefreshRev,
  ])

  useEffect(() => {
    if (!activeId) return undefined

    window.__lechatE2eeDebug = async () => {
      const chat = chatsRef.current.find((item) => String(item.id) === String(activeId))
      if (!chat || chat.status === 'group') {
        return 'Buka percakapan direct terlebih dahulu.'
      }
      const lastEncrypted = [...chat.messages].reverse().find((item) => item.ciphertext && item.iv)
      const result = await debugDirectMessage({
        message: lastEncrypted ?? null,
        currentUsername: currentUsernameRef.current,
        peerUserId: chat.peerUserId,
        peerUsername: chat.peerUsername,
      })
      console.log('Lechat E2EE debug:', result)
      return result
    }

    return () => {
      delete window.__lechatE2eeDebug
    }
  }, [activeId])

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
    setSecurityWarning(null)
    setActiveId(chatId)
    setActiveView('chats')
    setShowConversations(false)
  }

  async function loadOlderMessages() {
    const chatId = activeId
    const chatKey = String(chatId)
    const beforeId = pagination[chatId]
    if (!chatId || !beforeId || loadingOlderChatIdsRef.current.has(chatKey)) return

    loadingOlderChatIdsRef.current.add(chatKey)
    setLoadingOlderChatIds((current) => new Set(current).add(chatKey))
    try {
      const page = await chatService.loadMessages(chatId, { beforeId })
      let items = page.items
      if (activeChat) {
        const { messages: decodedItems, peerWarning } = await decodeMessages(
          activeChat,
          page.items,
          currentUsername,
        )
        if (peerWarning) setSecurityWarning(peerWarning)
        items = decodedItems
      }
      setChats((current) => current.map((chat) => {
        if (String(chat.id) !== chatKey) return chat
        const existingIds = new Set(chat.messages.map((item) => String(item.id)))
        return {
          ...chat,
          messages: [
            ...items.filter((item) => !existingIds.has(String(item.id))),
            ...chat.messages,
          ],
        }
      }))
      setPagination((current) => ({ ...current, [chatId]: page.nextBeforeId }))
    } catch (error) {
      if (error?.peer) setSecurityWarning(error.peer)
      showNotice(error.message || 'Riwayat pesan lama gagal dimuat.')
    } finally {
      loadingOlderChatIdsRef.current.delete(chatKey)
      setLoadingOlderChatIds((current) => {
        const next = new Set(current)
        next.delete(chatKey)
        return next
      })
    }
  }

  async function createConversation(details) {
    try {
      const { conversation, created } = await chatService.createConversation(details)
      setChats((current) => created
        ? [conversation, ...current]
        : current.map((chat) => chat.id === conversation.id ? conversation : chat))
      if (details.type === 'group' && created && currentUsername) {
        try {
          await createAndPublishGroupKey({
            conversationId: conversation.id,
            keyVersion: 1,
            currentUsername,
            members: (details.memberIds || []).map((id) => ({ id })),
          })
        } catch (err) {
          console.warn('Inisialisasi kunci grup baru dilewati:', err?.message ?? err)
          showNotice(`Grup dibuat, tetapi kunci E2EE belum terpasang: ${err?.message ?? 'kesalahan tidak diketahui'}. Buat ulang grup setelah semua anggota membuka Lechat sekali; tanpa kunci, pesan grup tidak dapat dikirim.`)
        }
      }
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
      setContactsLoaded(true)
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
      // Kontrak §5.2: bungkus ulang versi kunci aktif untuk anggota baru supaya
      // anggota baru dapat mengambil kunci via GET /keys/me dan ikut bertukar pesan.
      rewrapGroupKeyForMember({
        conversationId: activeChat.id,
        currentUsername,
        newUserId: userId,
      })
        .then((result) => {
          showNotice(result
            ? 'Undangan grup terkirim dan kunci grup dibagikan ke anggota baru.'
            : 'Undangan grup terkirim. (Kunci grup akan dibagikan saat anggota bertukar pesan.)')
        })
        .catch((error) => {
          console.warn('Rewrap kunci grup untuk anggota baru gagal:', error?.message ?? error)
          showNotice('Undangan grup terkirim, tetapi kunci grup belum dibagikan ke anggota baru.')
        })
      return true
    } catch (error) {
      if (error.response?.status === 409) {
        await retryLoadGroupMembers()
        showNotice(error.message || 'Kontak sudah menjadi anggota atau memiliki undangan yang masih aktif.')
      } else {
        showNotice(error.message || 'Anggota gagal diundang.')
      }
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

  async function ensureGroupKeyInitialized() {
    if (!activeChat || activeChat.status !== 'group') return false

    // Jangan timpa grup yang sudah aktif E2EE: cek riwayat terenkripsi
    // di server dan di state lokal. Jika ada, biarkan error asli tampil.
    const hasEncryptedServer = await chatService.conversationHasEncryptedMessages(activeChat.id)
    const hasEncryptedLocal = activeChat.messages.some((item) => Number(item.encryption_version) === 1)
    if (hasEncryptedServer || hasEncryptedLocal) return false

    const members = groupMemberState?.conversationId === activeChat.id
      && groupMemberState?.members?.length
      ? groupMemberState.members
      : await chatService.listGroupMembers(activeChat.id).catch(() => [])
    try {
      await createAndPublishGroupKey({
        conversationId: activeChat.id,
        keyVersion: 1,
        currentUsername,
        members,
      })
      showNotice('Enkripsi end-to-end grup berhasil diaktifkan. Pesan berikutnya akan terenkripsi.')
      return true
    } catch (error) {
      console.warn('Mengaktifkan E2EE grup gagal:', error?.message ?? error)
      showNotice(`Enkripsi grup belum berhasil diaktifkan: ${error?.message ?? 'kesalahan tidak diketahui'}. Coba lagi setelah semua anggota membuka Lechat sekali.`)
      return false
    }
  }

  async function sendMessage(event, attachments = [], replyingTo = null) {
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
    if (new TextEncoder().encode(text).length > MAX_PLAINTEXT_BYTES) {
      throw new Error('Pesan terlalu panjang (maksimum sekitar 48 KB). Pisah menjadi beberapa pesan lebih pendek.')
    }
    const frame = {
      type: 'message.send',
      conversation_id: activeId,
      client_message_id: crypto.randomUUID(),
      message_type: 'text',
      ...(replyingTo?.id ? { reply_to_message_id: replyingTo.id } : {}),
    }
    if (activeChat.status === 'group') {
      let encrypted
      try {
        encrypted = await encryptGroupMessage({
          text,
          conversationId: activeId,
          fromUsername: currentUsername,
        })
      } catch (error) {
        // Kontrak §4.1: jika kunci belum ada karena grup fresh/legacy (belum
        // ada pesan terenkripsi), aktifkan E2EE lalu kirim ulang. Grup yang
        // sudah aktif E2EE dibiarkan error (tidak menimpa kunci).
        if (error?.code === 'group_key_unavailable' && await ensureGroupKeyInitialized()) {
          encrypted = await encryptGroupMessage({
            text,
            conversationId: activeId,
            fromUsername: currentUsername,
          })
        } else {
          throw error
        }
      }
      Object.assign(frame, encrypted)
    } else {
      if (!currentUsername || !activeChat.peerUsername) {
        throw new Error('Username Anda atau kontak belum tersedia untuk menyiapkan E2EE.')
      }
      if (!activeChat.peerUserId) {
        throw new Error('ID pengguna kontak belum tersedia. Muat ulang daftar percakapan lalu coba lagi.')
      }
      const canonical = resolveCanonicalUsernames(activeChat.messages)
      try {
        Object.assign(frame, await encryptDirectMessage({
          text,
          from: canonical.from ?? currentUsername,
          to: canonical.to ?? activeChat.peerUsername,
          toUserId: activeChat.peerUserId,
        }))
      } catch (error) {
        if (error?.peer) setSecurityWarning(error.peer)
        throw error
      }
    }
    assertSendRateLimit()
    recordSendTimestamp()
    const time = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date())
    pendingMessagesRef.current.set(frame.client_message_id, { frame, text, failed: false })
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
            receiptStatus: 'sent',
            security: frame.encryption_version === 1 ? 'e2ee' : 'legacy',
            ...(replyingTo ? {
              reply_to: {
                id: replyingTo.id,
                author: replyingTo.senderName,
                body: replyingTo.text,
                is_deleted: replyingTo.isDeleted,
              },
            } : {}),
            pending: true,
          }),
          time,
        }
        : chat
    )))
    setMessage('')
  }

  async function confirmDeviceIdentity() {
    if (!currentUsername) return
    try {
      await publishIdentity(currentUsername)
      setIdentityConflict(null)
      setKeyTrustRevision((revision) => revision + 1)
      showNotice('Kunci perangkat ini kini dipakai untuk akun Anda.')
    } catch (error) {
      showNotice(error.message || 'Kunci perangkat gagal dipublikasikan.')
    }
  }

  async function trustChangedPeerKey() {
    if (!securityWarning?.username || !securityWarning.userId || !securityWarning.publicKey) return
    try {
      await trustPeerKey({
        userId: securityWarning.userId,
        username: securityWarning.username,
        account: currentUsername,
        publicKey: securityWarning.publicKey,
        updatedAt: securityWarning.updatedAt,
      })
      setSecurityWarning(null)
      setKeyTrustRevision((revision) => revision + 1)
      showNotice(`Kunci ${securityWarning.username} telah diverifikasi di perangkat ini.`)
    } catch (error) {
      showNotice(error.message || 'Kunci lawan bicara gagal disimpan.')
    }
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
              peerUsername: contact.username || chat.username,
              peerUserId: chat.peerUserId ?? contact.id,
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
      data-message-size={messageFontSize}
      data-message-font={messageFontFamily}
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
        profileInitials={currentProfileInitials}
        profileAvatarUrl={profileAvatarUrl}
        onAvatarImageError={requestAvatarRefresh}
        onFilterChange={setFilter}
        onViewChange={(view) => {
          setActiveView(view)
          setShowConversations(true)
        }}
        onNewChat={() => {
          setIsNewChatOpen(true)
          void loadGroupContacts()
        }}
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
      />
      <ChatWindow
        key={activeId ?? 'empty-chat'}
        chat={activeChat}
        groupMembers={groupMemberState && groupMemberState.conversationId === activeChat?.id
          ? groupMemberState.members
          : []}
        message={message}
        onBack={() => setShowConversations(true)}
        onProfileClick={() => setActiveSidePanel((panel) => panel === 'contact' ? null : 'contact')}
        onPersonalProfileClick={togglePersonalProfile}
        onArchiveChat={() => activeChat && archiveChat(activeChat.id)}
        onNotice={showNotice}
        readReceiptsEnabled={readReceiptsEnabled}
        socketStatus={socketStatus}
        isPersonalProfileExpanded={activeSidePanel === 'profile'}
        profileInitials={currentProfileInitials}
        profileAvatarUrl={profileAvatarUrl}
        onAvatarImageError={requestAvatarRefresh}
        hasOlderMessages={Boolean(pagination[activeId])}
        isLoadingOlder={isLoadingOlder}
        isLoadingMessages={isLoadingChatHistory}
        onLoadOlder={loadOlderMessages}
        isProfileExpanded={activeSidePanel === 'contact'}
        onMessageChange={setMessage}
        onSendMessage={(event, attachments, replyingTo) => (
          sendMessage(event, attachments, replyingTo)
        )}
        securityWarning={securityWarning
          && securityWarning.username === activeChat?.peerUsername
          ? securityWarning
          : null}
        onTrustPeerKey={trustChangedPeerKey}
        onRetryMessage={retryPendingMessage}
        theme={theme}
      />
      {identityConflict && (
        <div className="identity-conflict-banner" role="alertdialog" aria-label="Konflik kunci E2EE">
          <div className="identity-conflict-copy">
            <strong>Kunci akun {identityConflict.username} terakhir diubah dari perangkat lain.</strong>
            <span>
              Pesan lama yang dienkripsi dengan kunci perangkat sebelumnya tidak akan dapat dibuka di sini,
              dan lawan bicara akan diminta memverifikasi ulang. Gunakan kunci perangkat ini?
            </span>
          </div>
          <button type="button" className="identity-conflict-primary" onClick={confirmDeviceIdentity}>
            Ya, gunakan kunci perangkat ini
          </button>
          <button type="button" onClick={() => onLogout?.()}>Keluar</button>
        </div>
      )}
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
              contacts={contacts}
              members={groupMemberState && groupMemberState.conversationId === activeChat?.id
                ? groupMemberState.members
                : []}
              membersError={groupMemberState && groupMemberState.conversationId === activeChat?.id
                ? groupMemberState.error
                : ''}
              isLoadingMembers={activeChat?.status === 'group'
                && (
                  groupMemberState?.conversationId !== activeChat.id
                  || groupMemberState.loading
                )}
              canInviteMembers={groupMemberState
                && groupMemberState.conversationId === activeChat?.id
                && !groupMemberState.loading
                && groupMemberState.members.some((member) => (
                  String(member.user_id) === String(chatService.getCurrentUserId())
                  && ['owner', 'admin'].includes(String(member.role).toLowerCase())
                ))}
              onRetryLoadMembers={retryLoadGroupMembers}
              onRefreshMembers={retryLoadGroupMembers}
              isLoadingContacts={isLoadingGroupContacts}
              contactsError={groupContactsError}
              onLoadContacts={loadGroupContacts}
              onClose={() => setActiveSidePanel(null)}
              onViewMedia={() => setIsMediaOpen(true)}
              onFileAction={() => showNotice('File contoh ini belum tersedia untuk diunduh.')}
              onCall={() => showNotice('Fitur panggilan belum terhubung ke layanan.')}
              onInviteMember={inviteGroupMember}
              onNotice={showNotice}
            />
          ) : activeSidePanel === 'profile' ? (
            <PersonalProfile
              profile={userProfile}
              profileAvatarUrl={profileAvatarUrl}
              onAvatarImageError={requestAvatarRefresh}
              isLoading={isProfileLoading}
              loadError={profileLoadError}
              onRetry={retryLoadProfile}
              onProfileUpdated={(profile) => {
                setUserProfile(profile)
                saveCachedCurrentUserProfile(profile)
              }}
              onSettingsClick={() => setActiveSidePanel('settings')}
              onClose={() => setActiveSidePanel(null)}
              onLogout={onLogout}
            />
          ) : (
            <SettingsPanel
              theme={theme}
              onThemeChange={toggleTheme}
              notificationsEnabled={notificationsEnabled}
              readReceiptsEnabled={readReceiptsEnabled}
              messageFontSize={messageFontSize}
              messageFontFamily={messageFontFamily}
              onNotificationsChange={toggleNotifications}
              onReadReceiptsChange={toggleReadReceipts}
              onMessageFontSizeChange={setMessageFontSize}
              onMessageFontFamilyChange={setMessageFontFamily}
              onClose={() => setActiveSidePanel('profile')}
            />
          )}
        </>
      )}
      {isNewChatOpen && (
        <NewChatDialog
          contacts={contacts}
          isLoadingContacts={isLoadingGroupContacts}
          contactsError={groupContactsError}
          onRetryLoadContacts={loadGroupContacts}
          onOpenContacts={() => {
            setIsNewChatOpen(false)
            setActiveView('contacts')
            setShowConversations(true)
          }}
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

function NewChatDialog({
  contacts,
  isLoadingContacts,
  contactsError,
  onRetryLoadContacts,
  onOpenContacts,
  onClose,
  onCreate,
}) {
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const query = search.trim().toLowerCase()
  const filteredContacts = contacts.filter((contact) => (
    `${contact.name} ${contact.username ?? ''}`.toLowerCase().includes(query)
  ))

  function handleSubmit(event) {
    event.preventDefault()
    const memberIds = selectedIds.map((id) => (/^\d+$/.test(id) ? Number(id) : id))
    onCreate({ type: 'group', memberIds, title })
  }

  function toggleContact(contactId) {
    const normalizedId = String(contactId)
    setSelectedIds((current) => current.includes(normalizedId)
      ? current.filter((id) => id !== normalizedId)
      : [...current, normalizedId])
  }

  return (
    <div className="chat-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="chat-modal new-group-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="chat-modal-heading">
          <div>
            <span className="eyebrow">OBROLAN BERSAMA</span>
            <h2 id="new-chat-title">Buat grup baru</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label htmlFor="new-chat-title">Nama grup <span>(opsional)</span></label>
          <input
            autoFocus
            id="new-chat-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={60}
            placeholder="Contoh: Tim Produk"
          />

          <div className="group-member-heading">
            <span>Pilih anggota</span>
            <span>{selectedIds.length} dipilih</span>
          </div>
          <label className="group-contact-search">
            <ChatIcon name="search" size={17} />
            <input
              type="search"
              placeholder="Cari nama kontak..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Cari kontak untuk grup"
            />
          </label>

          <div className="group-contact-list" aria-label="Daftar kontak">
            {isLoadingContacts ? (
              <p className="empty-state" role="status">Memuat daftar kontak...</p>
            ) : contactsError ? (
              <div className="group-contact-error" role="alert">
                <p>{contactsError}</p>
                <button type="button" onClick={onRetryLoadContacts}>Coba lagi</button>
              </div>
            ) : contacts.length === 0 ? (
              <div className="group-contact-empty">
                <p>Belum ada kontak untuk ditambahkan ke grup.</p>
                <button type="button" onClick={onOpenContacts}>Buka daftar kontak</button>
              </div>
            ) : filteredContacts.length === 0 ? (
              <p className="empty-state">Kontak tidak ditemukan.</p>
            ) : filteredContacts.map((contact) => {
              const isSelected = selectedIds.includes(String(contact.id))
              return (
                <label
                  className={`group-contact-option${isSelected ? ' selected' : ''}`}
                  key={contact.id}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleContact(contact.id)}
                  />
                  <ChatAvatar chat={contact} />
                  <span className="contact-list-copy">
                    <strong>{contact.name}</strong>
                    <small>{contact.status === 'online' ? 'Online sekarang' : 'Kontak'}</small>
                  </span>
                  <span
                    className={`contact-presence${contact.status === 'online' ? ' is-online' : ''}`}
                    aria-label={contact.status === 'online' ? 'Online' : 'Offline'}
                  />
                </label>
              )
            })}
          </div>

          <div className="chat-modal-actions">
            <button type="button" onClick={onClose}>Batal</button>
            <button type="submit" disabled={!selectedIds.length || isLoadingContacts || Boolean(contactsError)}>
              Buat grup
            </button>
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
