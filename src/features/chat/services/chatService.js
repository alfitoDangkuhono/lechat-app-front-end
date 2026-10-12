import { initialChats } from '../chatData.js'

let conversations = initialChats.map(cloneConversation)

function cloneConversation(conversation) {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({
      ...message,
      ...(message.attachments ? { attachments: [...message.attachments] } : {}),
    })),
  }
}

function findConversation(conversationId) {
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) {
    throw new Error('Percakapan tidak ditemukan.')
  }
  return conversation
}

function getCurrentTime() {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function listConversations() {
  return conversations.map(cloneConversation)
}

async function createConversation({ name, type = 'contact' }) {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new Error('Nama percakapan wajib diisi.')
  }

  const existing = conversations.find((conversation) => (
    conversation.name.toLowerCase() === normalizedName.toLowerCase()
  ))
  if (existing) {
    existing.archived = false
    return { conversation: cloneConversation(existing), created: false }
  }

  const colorOptions = ['peach', 'violet', 'blue', 'green', 'yellow']
  const conversation = {
    id: createId(),
    name: normalizedName,
    initials: normalizedName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    color: colorOptions[conversations.length % colorOptions.length],
    status: type === 'group' ? 'group' : 'offline',
    preview: 'Percakapan baru',
    time: '',
    unread: 0,
    archived: false,
    messages: [],
  }

  conversations = [conversation, ...conversations]
  return { conversation: cloneConversation(conversation), created: true }
}

async function markConversationRead(conversationId) {
  const conversation = findConversation(conversationId)
  conversation.unread = 0
  return cloneConversation(conversation)
}

async function sendMessage(conversationId, { text = '', attachments = [] }) {
  const conversation = findConversation(conversationId)
  const normalizedText = text.trim()
  if (!normalizedText && attachments.length === 0) {
    throw new Error('Pesan atau lampiran wajib diisi.')
  }

  const time = getCurrentTime()
  const preview = normalizedText || attachments.map((file) => file.name).join(', ')
  const updatedConversation = {
    ...conversation,
    preview,
    time,
    messages: [
      ...conversation.messages,
      {
        id: createId(),
        from: 'me',
        text: normalizedText,
        time,
        attachments: [...attachments],
      },
    ],
  }

  conversations = [
    updatedConversation,
    ...conversations.filter((item) => item.id !== conversationId),
  ]
  return cloneConversation(updatedConversation)
}

async function archiveConversation(conversationId) {
  const conversation = findConversation(conversationId)
  conversation.archived = true
  return cloneConversation(conversation)
}

async function restoreConversation(conversationId) {
  const conversation = findConversation(conversationId)
  conversation.archived = false
  return cloneConversation(conversation)
}

export const chatService = {
  listConversations,
  createConversation,
  markConversationRead,
  sendMessage,
  archiveConversation,
  restoreConversation,
}
