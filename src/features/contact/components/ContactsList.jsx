import ChatAvatar from '../../chat/components/ChatAvatar'
import ChatIcon from '../../chat/components/ChatIcon'
import './ContactsList.css'

function ContactsList({ chats, search, onSearchChange, onSelectContact }) {
  const query = search.trim().toLowerCase()
  const contacts = chats
    .filter((chat) => chat.status !== 'group')
    .filter((chat) => `${chat.name} ${chat.status}`.toLowerCase().includes(query))
    .sort((first, second) => {
      if (first.status === 'online' && second.status !== 'online') return -1
      if (second.status === 'online' && first.status !== 'online') return 1
      return first.name.localeCompare(second.name)
    })
  const onlineCount = contacts.filter((chat) => chat.status === 'online').length

  return (
    <>
      <div className="contacts-summary">
        <span className="contacts-summary-icon"><ChatIcon name="users" size={17} /></span>
        <span><strong>{contacts.length} kontak</strong><small>{onlineCount} sedang online</small></span>
      </div>

      <label className="search-box contacts-search">
        <ChatIcon name="search" size={18} />
        <input
          type="search"
          placeholder="Cari nama kontak..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <div className="contacts-section-heading">
        <span>SEMUA KONTAK</span>
        <span>{contacts.length}</span>
      </div>

      <div className="contacts-list">
        {contacts.map((contact) => (
          <button
            className="contact-list-item"
            key={contact.id}
            type="button"
            onClick={() => onSelectContact(contact.id)}
          >
            <ChatAvatar chat={contact} />
            <span className="contact-list-copy">
              <strong>{contact.name}</strong>
              <small>{contact.status === 'online' ? 'Online sekarang' : 'Terakhir dilihat baru-baru ini'}</small>
            </span>
            <span className={`contact-presence${contact.status === 'online' ? ' is-online' : ''}`} aria-label={contact.status === 'online' ? 'Online' : 'Offline'} />
          </button>
        ))}
        {contacts.length === 0 && (
          <p className="empty-state">Kontak tidak ditemukan.</p>
        )}
      </div>
    </>
  )
}

export default ContactsList
