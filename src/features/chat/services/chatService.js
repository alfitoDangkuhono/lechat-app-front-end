import api from '../../../services/api'
import { getAuthToken } from '../../auth/services/authTokenService'

const ARCHIVED_CONVERSATIONS_KEY = 'lechat-archived-conversations'
const COLORS = ['peach', 'violet', 'blue', 'green', 'yellow']

function responseData(response) {
  return response.data?.data ?? response.data
}

function listFromResponse(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.conversations)) return data.conversations
  if (Array.isArray(data?.contacts)) return data.contacts
  if (Array.isArray(data?.invitations)) return data.invitations
  if (Array.isArray(data?.requests)) return data.requests
  return []
}

function archivedIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(ARCHIVED_CONVERSATIONS_KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.map(String) : [])
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    localStorage.removeItem(ARCHIVED_CONVERSATIONS_KEY)
    return new Set()
  }
}

function saveArchivedIds(ids) {
  localStorage.setItem(ARCHIVED_CONVERSATIONS_KEY, JSON.stringify([...ids]))
}

function getUserIdFromToken() {
  const token = getAuthToken()
  if (!token) return null

  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=')))
    return decoded.sub ?? decoded.user_id ?? decoded.id ?? null
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException) return null
    throw error
  }
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function otherMember(conversation) {
  const members = Array.isArray(conversation.members) ? conversation.members : []
  const userId = getUserIdFromToken()
  return members.find((member) => (
    member.is_self || member.is_me || member.is_current_user
      ? false
      : userId !== null && String(member.user_id ?? member.user?.id ?? member.id) === String(userId)
        ? false
        : true
  ))
}

function memberUserId(member) {
  return member.user_id
    ?? member.user?.user_id
    ?? member.user?.id
    ?? member.id
}

function conversationHasMember(conversation, userId) {
  const members = Array.isArray(conversation.members) ? conversation.members : []
  return members.some((member) => String(memberUserId(member)) === String(userId))
}

function findDirectConversation(conversations, userId) {
  return conversations.find((conversation) => (
    conversation.type !== 'group' && conversationHasMember(conversation, userId)
  ))
}

function lastMessageFor(conversation) {
  return conversation.last_message
    ?? conversation.lastMessage
    ?? conversation.latest_message
    ?? conversation.latestMessage
    ?? null
}

function lastMessageText(message) {
  if (typeof message === 'string') return message
  if (!message || typeof message !== 'object') return ''

  const content = message.body
    ?? message.content
    ?? message.text
    ?? message.message
    ?? message.message_text
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') return lastMessageText(content)
  return ''
}

export function mapConversation(conversation, index = 0) {
  const member = otherMember(conversation)
  const rawId = conversation.id ?? conversation.conversation_id
  const id = rawId ?? `conversation-${index}`
  const title = conversation.title
    || member?.name
    || member?.full_name
    || member?.username
    || 'Percakapan'
  const lastMessage = lastMessageFor(conversation)
  const preview = lastMessageText(lastMessage)
    || conversation.last_message_text
    || conversation.last_message_body
    || 'Belum ada pesan'
  const colors = COLORS
  const colorIndex = [...String(id)].reduce((total, character) => total + character.charCodeAt(0), 0)
    % colors.length
  const isGroup = conversation.type === 'group'

  return {
    ...conversation,
    id,
    name: title,
    initials: title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    color: colors[colorIndex],
    status: isGroup ? 'group' : 'offline',
    preview,
    time: formatTime(
      lastMessage?.created_at
      ?? lastMessage?.sent_at
      ?? conversation.updated_at
      ?? conversation.created_at,
    ),
    unread: Number(conversation.unread_message_count ?? conversation.unread ?? 0),
    archived: archivedIds().has(String(id)),
    messages: [],
  }
}

export function mapMessage(message) {
  const sender = message.sender ?? message.user ?? {}
  const normalizedSender = typeof sender === 'object' && sender !== null ? sender : {}
  const author = typeof message.author === 'object' && message.author !== null
    ? message.author
    : {}
  const senderId = message.sender_id
    ?? message.user_id
    ?? message.sender_user_id
    ?? normalizedSender.user_id
    ?? normalizedSender.id
  const senderName = [
    normalizedSender.name,
    normalizedSender.full_name,
    normalizedSender.display_name,
    [normalizedSender.first_name, normalizedSender.last_name]
      .filter((part) => typeof part === 'string')
      .join(' '),
    normalizedSender.username,
    message.sender_name,
    message.sender_display_name,
    [message.sender_first_name, message.sender_last_name]
      .filter((part) => typeof part === 'string')
      .join(' '),
    message.sender_username,
    message.username,
    author.name,
    author.full_name,
    author.username,
    message.author,
  ].find((name) => typeof name === 'string' && name.trim())?.trim() ?? ''
  const currentUserId = getUserIdFromToken()
  const from = message.is_own
    || message.is_mine
    || message.is_self
    || sender.is_self
    || (currentUserId !== null && senderId !== undefined && String(senderId) === String(currentUserId))
    ? 'me'
    : 'them'
  const rawReply = message.reply_to ?? message.reply ?? null
  const rawReplySender = rawReply?.sender
  const rawReplySenderObject = typeof rawReplySender === 'object' && rawReplySender !== null
    ? rawReplySender
    : {}
  const rawReplySenderId = rawReply?.sender_id
    ?? rawReplySenderObject.user_id
    ?? rawReplySenderObject.id
  const replyTo = typeof rawReply === 'object' && rawReply !== null
    ? {
      ...rawReply,
      id: rawReply.id ?? rawReply.message_id,
      sender_id: rawReplySenderId,
      author: rawReply.author
        ?? rawReply.sender_username
        ?? rawReply.username
        ?? rawReplySenderObject.username
        ?? '',
      text: rawReply.body ?? rawReply.content ?? rawReply.text ?? '',
      type: rawReply.type ?? rawReply.message_type ?? 'text',
      from: rawReply.is_own
        || rawReply.is_mine
        || rawReply.is_self
        || rawReplySenderObject.is_self
        || (currentUserId !== null
          && rawReplySenderId !== undefined
          && String(rawReplySenderId) === String(currentUserId))
        ? 'me'
        : 'them',
    }
    : null
  const receiptStatus = message.receipt_status === 'read'
    || message.read_at
    || message.is_read === true
    ? 'read'
    : message.receipt_status === 'delivered'
      || message.delivered_at
      || message.is_delivered === true
      ? 'delivered'
      : 'sent'

  return {
    ...message,
    id: message.id ?? message.message_id ?? message.client_message_id,
    sender_id: senderId,
    from,
    author: senderName,
    text: message.body ?? message.content ?? message.text ?? '',
    reply_to: replyTo,
    receiptStatus,
    time: formatTime(message.created_at ?? message.time),
  }
}

async function listConversations() {
  const response = await api.get('/conversations')
  return listFromResponse(responseData(response)).map(mapConversation)
}

async function listContacts() {
  const response = await api.get('/contacts')
  return listFromResponse(responseData(response)).map((contact) => ({
    ...contact,
    id: contact.user_id ?? contact.id,
    name: contact.name ?? contact.full_name ?? contact.username ?? 'Kontak',
    username: contact.username ?? '',
    initials: (contact.name ?? contact.full_name ?? contact.username ?? 'K')
      .split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    color: COLORS[String(contact.user_id ?? contact.id).length % COLORS.length],
    status: contact.online || contact.is_online || contact.status === 'online'
      ? 'online'
      : 'offline',
  }))
}

async function listContactRequests() {
  const response = await api.get('/contacts/requests')
  const data = responseData(response)
  const allRequests = listFromResponse(data)
  const incoming = Array.isArray(data?.incoming)
    ? data.incoming
    : allRequests.filter((request) => request.direction === 'incoming')
  const outgoing = Array.isArray(data?.outgoing)
    ? data.outgoing
    : allRequests.filter((request) => request.direction === 'outgoing')

  function mapRequest(request, direction) {
    const user = direction === 'incoming'
      ? request.user ?? request.sender ?? request
      : request.user ?? request.recipient ?? request.receiver ?? request
    const userId = request.user_id ?? user.user_id ?? user.id ?? request.id
    const phone = request.phone ?? user.phone ?? user.handphone ?? ''

    return {
      ...request,
      id: userId ?? request.request_id ?? request.id ?? phone,
      name: user.name ?? user.full_name ?? user.username ?? (phone || 'Pengguna'),
      username: user.username ?? '',
      phone,
      direction,
    }
  }

  return {
    incoming: incoming.map((request) => mapRequest(request, 'incoming')),
    outgoing: outgoing.map((request) => mapRequest(request, 'outgoing')),
  }
}

async function listGroupInvitations() {
  const response = await api.get('/group-invitations')
  const data = responseData(response)
  return listFromResponse(data).map((invitation) => ({
    ...invitation,
    id: invitation.invitation_id ?? invitation.id,
    title: invitation.conversation?.title ?? invitation.title ?? 'Grup',
    inviterName: invitation.inviter?.name
      ?? invitation.inviter?.full_name
      ?? invitation.inviter_name
      ?? 'Pengguna',
  }))
}

async function listGroupMembers(conversationId) {
  const response = await api.get(
    `/conversations/${encodeURIComponent(conversationId)}/members`,
  )
  const data = responseData(response)
  if (!Array.isArray(data)) {
    throw new Error('Respons daftar anggota grup tidak valid.')
  }

  return data.map((member) => {
    const firstName = typeof member.first_name === 'string' ? member.first_name : ''
    const lastName = typeof member.last_name === 'string' ? member.last_name : ''
    const name = [firstName, lastName].filter(Boolean).join(' ')
      || member.username
      || 'Pengguna'

    return {
      ...member,
      id: member.user_id,
      name,
      initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
      role: member.role,
    }
  })
}

async function requestContact(phone) {
  if (typeof phone !== 'string' || !phone.trim()) {
    throw new Error('Nomor telepon wajib diisi.')
  }
  return api.post('/contacts/requests', { phone })
}

async function respondToContactRequest(userId, accepted) {
  const normalizedId = encodeURIComponent(String(userId).trim())
  if (!normalizedId) throw new Error('ID pengguna wajib diisi.')
  return accepted
    ? api.post(`/contacts/${normalizedId}/accept`)
    : api.delete(`/contacts/${normalizedId}/requests`)
}

async function respondToGroupInvitation(invitationId, accepted) {
  const normalizedId = encodeURIComponent(String(invitationId).trim())
  if (!normalizedId) throw new Error('ID undangan wajib diisi.')
  return accepted
    ? api.post(`/group-invitations/${normalizedId}/accept`)
    : api.delete(`/group-invitations/${normalizedId}`)
}

async function inviteToGroup(conversationId, userId) {
  const normalizedUserId = String(userId).trim()
  if (!normalizedUserId) throw new Error('ID pengguna wajib diisi.')
  return api.post(
    `/conversations/${encodeURIComponent(conversationId)}/invitations`,
    { user_id: /^\d+$/.test(normalizedUserId) ? Number(normalizedUserId) : normalizedUserId },
  )
}

async function createConversation({ type = 'direct', memberIds = [], title, contact }) {
  if (!memberIds.length) {
    throw new Error('Pilih setidaknya satu anggota selain diri sendiri.')
  }

  const response = await api.post('/conversations', {
    type,
    member_ids: memberIds,
    ...(type === 'group' && title?.trim() ? { title: title.trim() } : {}),
  })
  const data = responseData(response)
  const conversation = data?.conversation ?? data
  if (!conversation?.id) {
    throw new Error('Respons backend tidak berisi percakapan yang valid.')
  }

  const mappedConversation = mapConversation(conversation)

  return {
    conversation: type === 'direct' && contact?.name
      ? {
        ...mappedConversation,
        name: contact.name,
        initials: contact.initials
          ?? contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
        color: contact.color ?? mappedConversation.color,
      }
      : mappedConversation,
    created: data?.created ?? true,
  }
}

async function loadMessages(conversationId, { limit = 50, beforeId } = {}) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (beforeId) query.set('before_id', String(beforeId))

  const response = await api.get(
    `/conversations/${encodeURIComponent(conversationId)}/messages?${query}`,
  )
  const data = responseData(response)
  const items = Array.isArray(data?.items) ? data.items : []

  return {
    items: items.map(mapMessage).reverse(),
    nextBeforeId: data?.next_before_id ?? null,
  }
}

async function markConversationRead(conversationId, throughMessageId) {
  if (!throughMessageId) return
  await api.post(
    `/conversations/${encodeURIComponent(conversationId)}/read`,
    { through_message_id: throughMessageId },
  )
}

async function archiveConversation(conversationId) {
  const ids = archivedIds()
  ids.add(String(conversationId))
  saveArchivedIds(ids)
  return { id: conversationId, archived: true }
}

async function restoreConversation(conversationId) {
  const ids = archivedIds()
  ids.delete(String(conversationId))
  saveArchivedIds(ids)
  return { id: conversationId, archived: false }
}

export const chatService = {
  getCurrentUserId: getUserIdFromToken,
  listConversations,
  listContacts,
  listContactRequests,
  listGroupInvitations,
  listGroupMembers,
  requestContact,
  respondToContactRequest,
  respondToGroupInvitation,
  inviteToGroup,
  createConversation,
  findDirectConversation,
  loadMessages,
  markConversationRead,
  mapMessage,
  archiveConversation,
  restoreConversation,
}
