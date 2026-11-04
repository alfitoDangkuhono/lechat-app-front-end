import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatAvatar from './ChatAvatar'
import ChatHeader from './ChatHeader'
import ChatIcon from './ChatIcon'

function ChatWindow({
  chat,
  groupMembers = [],
  message,
  onBack,
  onProfileClick,
  onPersonalProfileClick,
  onArchiveChat,
  onNotice,
  readReceiptsEnabled,
  isProfileExpanded,
  isPersonalProfileExpanded,
  profileInitials,
  socketStatus,
  onMessageChange,
  onSendMessage,
  hasOlderMessages,
  isLoadingOlder,
  isLoadingMessages,
  onLoadOlder,
}) {
  const [attachments, setAttachments] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [openMessageActionsId, setOpenMessageActionsId] = useState(null)
  const fileInputRef = useRef(null)
  const chatContentRef = useRef(null)
  const messagesEndRef = useRef(null)
  const loadingOlderRef = useRef(false)
  const historyScrollAnchorRef = useRef(null)
  const pendingInitialScrollRef = useRef(true)
  const messageGroups = groupMessagesByDate(chat?.messages ?? [])
  const previousMessagesRef = useRef({ count: chat?.messages?.length ?? 0, firstId: chat?.messages?.[0]?.id })

  useLayoutEffect(() => {
    const messages = chat?.messages ?? []
    const previous = previousMessagesRef.current
    const prependedMessages = previous.count > 0
      && messages.length > previous.count
      && messages[0]?.id !== previous.firstId

    if (isLoadingMessages) {
      pendingInitialScrollRef.current = true
    } else if (pendingInitialScrollRef.current) {
      const container = chatContentRef.current
      if (container) container.scrollTop = container.scrollHeight
      pendingInitialScrollRef.current = false
      historyScrollAnchorRef.current = null
    } else if (prependedMessages && historyScrollAnchorRef.current?.conversationId === chat?.id) {
      const container = chatContentRef.current
      if (container) {
        const heightDifference = container.scrollHeight - historyScrollAnchorRef.current.scrollHeight
        container.scrollTop = historyScrollAnchorRef.current.scrollTop + heightDifference
      }
      historyScrollAnchorRef.current = null
    } else if (!prependedMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }

    previousMessagesRef.current = {
      count: messages.length,
      firstId: messages[0]?.id,
    }
  }, [chat?.id, chat?.messages, isLoadingMessages])

  useEffect(() => {
    if (!isLoadingOlder) {
      loadingOlderRef.current = false
      historyScrollAnchorRef.current = null
    }
  }, [isLoadingOlder])

  if (!chat) {
    return (
      <section className="chat-panel chat-empty-panel" aria-label="Percakapan">
        <button className="empty-chat-back" type="button" onClick={onBack}>Kembali ke daftar</button>
        <p>Pilih percakapan untuk mulai mengirim pesan, atau buat percakapan baru.</p>
      </section>
    )
  }

  function handleChatScroll(event) {
    const container = event.currentTarget
    if (
      container.scrollTop > 24
      || !hasOlderMessages
      || isLoadingOlder
      || isLoadingMessages
      || loadingOlderRef.current
    ) {
      return
    }

    loadingOlderRef.current = true
    historyScrollAnchorRef.current = {
      conversationId: chat.id,
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
    }
    Promise.resolve(onLoadOlder()).catch((error) => {
      onNotice(error.message || 'Riwayat pesan lama gagal dimuat.')
      loadingOlderRef.current = false
      historyScrollAnchorRef.current = null
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (attachments.length > 0) {
      onNotice('Backend saat ini hanya mendukung pesan teks; lampiran belum tersedia.')
      return
    }

    try {
      await onSendMessage(event, attachments, replyingTo)
      setAttachments([])
      setReplyingTo(null)
      setShowEmojiPicker(false)
    } catch (error) {
      onNotice(error.message || 'Pesan gagal dikirim.')
    }
  }

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files ?? [])
    if (selectedFiles.length) setAttachments((current) => [...current, ...selectedFiles])
    event.target.value = ''
  }

  return (
    <section className="chat-panel" aria-label="Percakapan">
      <ChatHeader
        chat={chat}
        onBack={onBack}
        onProfileClick={onProfileClick}
        onPersonalProfileClick={onPersonalProfileClick}
        onArchiveChat={onArchiveChat}
        onNotice={onNotice}
        isProfileExpanded={isProfileExpanded}
        isPersonalProfileExpanded={isPersonalProfileExpanded}
        profileInitials={profileInitials}
      />

      <div className="chat-content" ref={chatContentRef} onScroll={handleChatScroll}>
        {(isLoadingOlder || isLoadingMessages) && (
          <div className="chat-history-loading" role="status" aria-live="polite">
            <span className="chat-history-spinner" aria-hidden="true" />
            <span>Memuat pesan sebelumnya...</span>
          </div>
        )}
        <div className="message-list">
          {messageGroups.map((group) => (
            <section className="message-date-group" key={group.key}>
              <div className="day-divider" role="separator"><span>{group.label}</span></div>
              {group.messages.map((item) => {
                const messageActionKey = String(item.id ?? item.client_message_id ?? '')
                const isMessageActionsOpen = Boolean(messageActionKey)
                  && openMessageActionsId === messageActionKey
                const messageActions = (
                  <span className="message-actions">
                    <button
                      className="message-actions-trigger"
                      type="button"
                      aria-label="Opsi pesan"
                      aria-haspopup="menu"
                      aria-expanded={isMessageActionsOpen}
                      disabled={!messageActionKey}
                      onClick={() => setOpenMessageActionsId((current) => (
                        current === messageActionKey ? null : messageActionKey
                      ))}
                    >
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {isMessageActionsOpen && (
                      <span className="message-actions-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setReplyingTo({
                              id: item.id,
                              senderName: item.from === 'me' ? 'Anda' : item.author || chat.name,
                              text: item.text,
                              isDeleted: Boolean(item.deleted_at || item.is_deleted),
                            })
                            setOpenMessageActionsId(null)
                          }}
                          disabled={item.pending || !item.id}
                        >
                          Balas
                        </button>
                      </span>
                    )}
                  </span>
                )
                const senderAvatar = chat.status === 'group'
                  ? messageSenderAvatar(chat, item, groupMembers)
                  : null
                const bubbleColor = item.from === 'me'
                  ? ''
                  : senderAvatar?.color ?? chat.color
                const bubbleColorClass = bubbleColor
                  ? ` message-bubble-user-${bubbleColor}`
                  : ''

                return (
                  <div
                    className={`message-row ${item.from === 'me' ? 'message-outgoing' : 'message-incoming'}`}
                    key={item.id}
                  >
                    {item.from === 'them' && (
                      <ChatAvatar
                        chat={senderAvatar ?? chat}
                        small
                      />
                    )}
                    <div className="message-body">
                      {(item.text || item.reply_to || item.attachments?.length > 0) && (
                        <div className={`message-bubble${bubbleColorClass}`}>
                          {chat.status === 'group'
                            && item.from === 'them'
                            && senderAvatar?.username && (
                              <span className="message-author">{senderAvatar.username}</span>
                          )}
                          <div className="message-bubble-content">
                            {item.reply_to && (
                              <div className="message-reply-quote">
                                <strong>{getReplySender(item.reply_to, chat)}</strong>
                                <span>{getReplyText(item.reply_to)}</span>
                              </div>
                            )}
                            {item.text && <div className="message-text-line">{item.text}</div>}
                            {item.attachments?.map((file) => (
                              <div className="message-attachment" key={`${item.id}-${file.name}-${file.size}`}>
                                <ChatIcon name="paperclip" size={15} />
                                <span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span>
                              </div>
                            ))}
                          </div>
                          {messageActions}
                        </div>
                      )}
                      <div className="message-meta">
                        <time>{item.time}</time>
                        {item.from === 'me' && readReceiptsEnabled && (
                          item.receiptStatus === 'read'
                            ? <ChatIcon name="check-double" size={16} className="read-check read-check-read" />
                            : item.receiptStatus === 'delivered'
                              ? <ChatIcon name="check-double" size={16} className="read-check read-check-delivered" />
                              : <ChatIcon name="check" size={14} className="read-check" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-toolbar">
          <button type="button" className="composer-tool" aria-label="Lampirkan file" onClick={() => fileInputRef.current?.click()}>
            <ChatIcon name="paperclip" size={19} />
          </button>
          <input
            ref={fileInputRef}
            className="attachment-input"
            type="file"
            multiple
            onChange={handleFileChange}
            aria-label="Pilih file untuk dilampirkan"
          />
          <button type="button" className="composer-tool" aria-label="Pilih emoji" aria-expanded={showEmojiPicker} onClick={() => setShowEmojiPicker((visible) => !visible)}>
            <ChatIcon name="smile" size={19} />
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker" aria-label="Pilih emoji">
              {['😀', '😄', '😂', '🥰', '😊', '👍', '✨', '❤️'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Tambahkan ${emoji}`}
                  onClick={() => {
                    onMessageChange(`${message}${emoji}`)
                    setShowEmojiPicker(false)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((file, index) => (
              <span className="composer-attachment" key={`${file.name}-${file.size}-${index}`}>
                <ChatIcon name="paperclip" size={13} />
                {file.name}
                <button type="button" aria-label={`Hapus lampiran ${file.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </span>
            ))}
          </div>
        )}
        {replyingTo && (
          <div className="composer-reply-preview">
            <span className="composer-reply-copy">
              <strong>Membalas {replyingTo.senderName}</strong>
              <small>{replyingTo.isDeleted ? 'Pesan telah dihapus' : replyingTo.text}</small>
            </span>
            <button
              type="button"
              aria-label="Batalkan balasan"
              onClick={() => setReplyingTo(null)}
            >
              ×
            </button>
          </div>
        )}
        <input
          aria-label="Tulis pesan"
          placeholder={`Kirim pesan ke ${chat.name}...`}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
        />
        <button className="send-button" type="submit" aria-label="Kirim pesan" disabled={!message.trim() && attachments.length === 0}>
          <ChatIcon name="send" size={18} />
        </button>
        <span className="composer-hint">
          {socketStatus === 'connected' ? <>Tekan <kbd>Enter</kbd> untuk mengirim</> : 'Pesan akan dikirim saat koneksi siap'}
        </span>
      </form>
    </section>
  )
}

function getReplySender(message, chat) {
  if (message.from === 'me' || message.is_own) return 'Anda'
  return message.author
    || message.sender?.username
    || message.username
    || (chat.status === 'group' ? 'Anggota grup' : chat.name)
}

function getReplyText(message) {
  if (message.is_deleted || message.deleted_at) return 'Pesan telah dihapus'
  const text = message.text ?? message.body ?? message.content
  if (text) return text
  if (message.type && message.type !== 'text') return `Pesan ${message.type}`
  return 'Pesan'
}

function groupMessagesByDate(messages) {
  const today = new Date()
  const todayKey = getLocalDateKey(today)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = getLocalDateKey(yesterday)

  return messages.reduce((groups, message) => {
    const rawDate = message.created_at ?? message.sent_at ?? message.timestamp ?? message.date
    const parsedDate = rawDate ? new Date(rawDate) : today
    const date = Number.isNaN(parsedDate.getTime()) ? today : parsedDate
    const key = getLocalDateKey(date)
    const label = key === todayKey
      ? 'HARI INI'
      : key === yesterdayKey
        ? 'KEMARIN'
        : new Intl.DateTimeFormat('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(date)
    const currentGroup = groups[groups.length - 1]

    if (currentGroup?.key === key) {
      currentGroup.messages.push(message)
    } else {
      groups.push({ key, label, messages: [message] })
    }

    return groups
  }, [])
}

function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function messageSenderAvatar(chat, message, groupMembers) {
  const senderId = message.sender_id
    ?? message.user_id
    ?? message.sender_user_id
    ?? message.sender?.user_id
    ?? message.sender?.id
    ?? message.user?.user_id
    ?? message.user?.id
  const groupMember = groupMembers.find((member) => (
    senderId !== undefined
    && String(member.user_id ?? member.id) === String(senderId)
  ))
  const username = [
    message.sender_username,
    message.sender?.username,
    message.user?.username,
    typeof message.author === 'object' ? message.author.username : undefined,
    groupMember?.username,
  ].find((value) => typeof value === 'string' && value.trim())?.trim()

  const colorOptions = ['peach', 'violet', 'blue', 'green', 'yellow']
  const colorKey = senderId ?? username?.toLowerCase() ?? ''
  const colorIndex = [...String(colorKey)].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % colorOptions.length

  return {
    ...chat,
    username: username
      || (typeof message.author === 'string' ? message.author.trim() : ''),
    initials: username ? [...username].slice(0, 2).join('').toUpperCase() : '',
    color: colorOptions[colorIndex],
  }
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default ChatWindow
