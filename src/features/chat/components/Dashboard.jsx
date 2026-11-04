import { useEffect, useMemo, useRef, useState } from 'react'
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
import '../../../App.css'

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
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [profileLoadError, setProfileLoadError] = useState('')
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0)
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [isMediaOpen, setIsMediaOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const socketRef = useRef(null)
  const notificationAudioRef = useRef(null)
  const pendingMessagesRef = useRef(new Map())
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

  useEffect(() => {
    showConversationsRef.current = showConversations
  }, [showConversations])

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
        if (isCurrent) setIsProfileLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [profileLoadAttempt])

  useEffect(() => {
    if (isLoading) return undefined

    let isCurrent = true
    const connection = connectWebSocket({
      conversationId: activeId,
      onStatus: setSocketStatus,
      onEvent(event) {
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
            if (isViewingConversation) {
              connection.send({
                type: 'receipt.read',
                conversation_id: activeId,
                through_message_id: lastIncomingMessage.id,
              })
            }
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
          const incoming = chatService.mapMessage(rawMessage)
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
              preview: incoming.text || conversation.preview,
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
    Promise.resolve().then(() => {
      if (isCurrent) setLoadingHistoryChatId(activeId)
    })
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
    const chatId = activeId
    const chatKey = String(chatId)
    const beforeId = pagination[chatId]
    if (!chatId || !beforeId || loadingOlderChatIdsRef.current.has(chatKey)) return

    loadingOlderChatIdsRef.current.add(chatKey)
    setLoadingOlderChatIds((current) => new Set(current).add(chatKey))
    try {
      const page = await chatService.loadMessages(chatId, { beforeId })
      setChats((current) => current.map((chat) => {
        if (String(chat.id) !== chatKey) return chat
        const existingIds = new Set(chat.messages.map((item) => String(item.id)))
        return {
          ...chat,
          messages: [
            ...page.items.filter((item) => !existingIds.has(String(item.id))),
            ...chat.messages,
          ],
        }
      }))
      setPagination((current) => ({ ...current, [chatId]: page.nextBeforeId }))
    } catch (error) {
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
      showNotice('Undangan grup berhasil dikirim.')
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
    const frame = {
      type: 'message.send',
      conversation_id: activeId,
      client_message_id: crypto.randomUUID(),
      message_type: 'text',
      body: text,
      ...(replyingTo?.id ? { reply_to_message_id: replyingTo.id } : {}),
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
            receiptStatus: 'sent',
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
        hasOlderMessages={Boolean(pagination[activeId])}
        isLoadingOlder={isLoadingOlder}
        isLoadingMessages={isLoadingChatHistory}
        onLoadOlder={loadOlderMessages}
        isProfileExpanded={activeSidePanel === 'contact'}
        onMessageChange={setMessage}
        onSendMessage={(event, attachments, replyingTo) => (
          sendMessage(event, attachments, replyingTo)
        )}
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
              isLoading={isProfileLoading}
              loadError={profileLoadError}
              onRetry={retryLoadProfile}
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
