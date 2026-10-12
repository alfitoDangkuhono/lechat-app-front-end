function ChatAvatar({ chat, small = false }) {
  return (
    <div className={`avatar avatar-${chat.color}${small ? ' avatar-small' : ''}`}>
      {chat.initials}
      {chat.status === 'online' && <span className="online-dot" />}
    </div>
  )
}

export default ChatAvatar
