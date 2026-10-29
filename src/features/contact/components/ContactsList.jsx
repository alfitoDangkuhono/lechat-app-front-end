import { useState } from 'react'
import ChatAvatar from '../../chat/components/ChatAvatar'
import ChatIcon from '../../chat/components/ChatIcon'
import './ContactsList.css'

const emptyContact = {
  username: '',
  fullName: '',
  phone: '',
  email: '',
}

function ContactsList({ chats, search, onSearchChange, onSelectContact, onAddContact }) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [contact, setContact] = useState(emptyContact)
  const query = search.trim().toLowerCase()
  const contacts = chats
    .filter((chat) => chat.status !== 'group')
    .filter((chat) => `${chat.name} ${chat.username ?? ''} ${chat.status}`.toLowerCase().includes(query))
    .sort((first, second) => {
      if (first.status === 'online' && second.status !== 'online') return -1
      if (second.status === 'online' && first.status !== 'online') return 1
      return first.name.localeCompare(second.name)
    })
  const onlineCount = contacts.filter((chat) => chat.status === 'online').length

  function updateContact(event) {
    const { name, value } = event.target
    setContact((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const wasAdded = await onAddContact(contact)
    if (wasAdded) {
      setContact(emptyContact)
      setIsAddFormOpen(false)
    }
  }

  return (
    <>
      <div className="contacts-summary">
        <span className="contacts-summary-icon"><ChatIcon name="users" size={17} /></span>
        <span><strong>{contacts.length} kontak</strong><small>{onlineCount} sedang online</small></span>
      </div>

      <button
        className="add-contact-trigger"
        type="button"
        onClick={() => setIsAddFormOpen((isOpen) => !isOpen)}
        aria-expanded={isAddFormOpen}
        aria-controls="add-contact-form"
      >
        <ChatIcon name="plus" size={17} />
        Tambah kontak
      </button>

      {isAddFormOpen && (
        <form className="add-contact-form" id="add-contact-form" onSubmit={handleSubmit}>
          <strong className="add-contact-title">Kontak baru</strong>
          <label>
            Username
            <input
              autoFocus
              autoComplete="username"
              name="username"
              value={contact.username}
              onChange={updateContact}
              maxLength={30}
              required
            />
          </label>
          <label>
            Nama lengkap
            <input
              autoComplete="name"
              name="fullName"
              value={contact.fullName}
              onChange={updateContact}
              maxLength={80}
              required
            />
          </label>
          <label>
            No. handphone
            <input
              autoComplete="tel"
              type="tel"
              name="phone"
              value={contact.phone}
              onChange={updateContact}
              maxLength={20}
              required
            />
          </label>
          <label>
            Email
            <input
              autoComplete="email"
              type="email"
              name="email"
              value={contact.email}
              onChange={updateContact}
              maxLength={254}
              required
            />
          </label>
          <div className="add-contact-actions">
            <button type="button" onClick={() => {
              setContact(emptyContact)
              setIsAddFormOpen(false)
            }}>
              Batal
            </button>
            <button type="submit">Simpan</button>
          </div>
        </form>
      )}

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
