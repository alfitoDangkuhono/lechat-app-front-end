import { useEffect, useRef, useState } from 'react'
import ChatAvatar from './ChatAvatar'
import ChatHeader from './ChatHeader'
import ChatIcon from './ChatIcon'

function ChatWindow({
  chat,
  message,
  onBack,
  onProfileClick,
  onArchiveChat,
  onNotice,
  readReceiptsEnabled,
  isProfileExpanded,
  onMessageChange,
  onSendMessage,
}) {
  const [attachments, setAttachments] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat?.messages])

  if (!chat) {
    return (
      <section className="chat-panel chat-empty-panel" aria-label="Percakapan">
        <button className="empty-chat-back" type="button" onClick={onBack}>Kembali ke daftar</button>
        <p>Pilih percakapan untuk mulai mengirim pesan, atau buat percakapan baru.</p>
      </section>
    )
  }

  async function handleSubmit(event) {
    try {
      await onSendMessage(event, attachments)
      setAttachments([])
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
        onArchiveChat={onArchiveChat}
        onNotice={onNotice}
        isProfileExpanded={isProfileExpanded}
      />

      <div className="chat-content">
        <div className="day-divider"><span>HARI INI</span></div>
        <div className="message-list">
          {chat.messages.map((item) => (
            <div
              className={`message-row ${item.from === 'me' ? 'message-outgoing' : 'message-incoming'}`}
              key={item.id}
            >
              {item.from === 'them' && <ChatAvatar chat={chat} small />}
              <div className="message-body">
                {item.author && <span className="message-author">{item.author}</span>}
                {item.text && <div className="message-bubble">{item.text}</div>}
                {item.attachments?.map((file) => (
                  <div className="message-attachment" key={`${item.id}-${file.name}-${file.size}`}>
                    <ChatIcon name="paperclip" size={15} />
                    <span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span>
                  </div>
                ))}
                <div className="message-meta">
                  <time>{item.time}</time>
                  {item.from === 'me' && readReceiptsEnabled && <ChatIcon name="check" size={14} className="read-check" />}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="typing-indicator">
          <ChatAvatar chat={chat} small />
          <span className="typing-dots"><i /><i /><i /></span>
          <span>{chat.status === 'online' ? `${chat.name.split(' ')[0]} sedang mengetik` : 'Pesan terbaru'}</span>
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
        <input
          aria-label="Tulis pesan"
          placeholder={`Kirim pesan ke ${chat.name}...`}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
        />
        <button className="send-button" type="submit" aria-label="Kirim pesan" disabled={!message.trim() && attachments.length === 0}>
          <ChatIcon name="send" size={18} />
        </button>
        <span className="composer-hint">Tekan <kbd>Enter</kbd> untuk mengirim</span>
      </form>
    </section>
  )
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default ChatWindow
