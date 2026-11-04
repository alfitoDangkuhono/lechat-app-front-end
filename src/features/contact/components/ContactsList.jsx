import { useState } from 'react'
import ChatAvatar from '../../chat/components/ChatAvatar'
import ChatIcon from '../../chat/components/ChatIcon'
import './ContactsList.css'

function ContactsList({
  contacts,
  search,
  onSearchChange,
  onSelectContact,
  onAddContact,
  contactRequests,
  outgoingContactRequests,
  groupInvitations,
  onRespondToContactRequest,
  onRespondToGroupInvitation,
}) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const query = search.trim().toLowerCase()
  const filteredContacts = contacts
    .filter((contact) => `${contact.name} ${contact.username ?? ''} ${contact.id}`.toLowerCase().includes(query))
    .sort((first, second) => {
      if (first.status === 'online' && second.status !== 'online') return -1
      if (second.status === 'online' && first.status !== 'online') return 1
      return first.name.localeCompare(second.name)
    })
  const onlineCount = filteredContacts.filter((contact) => contact.status === 'online').length

  async function handleSubmit(event) {
    event.preventDefault()
    const wasAdded = await onAddContact({ phone })
    if (wasAdded) {
      setPhone('')
      setIsAddFormOpen(false)
    }
  }

  return (
    <>
      <div className="contacts-summary">
        <span className="contacts-summary-icon"><ChatIcon name="users" size={17} /></span>
        <span><strong>{filteredContacts.length} kontak</strong><small>{onlineCount} sedang online</small></span>
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
          <strong className="add-contact-title">Kirim permintaan kontak</strong>
          <label>
            Nomor telepon
            <input
              autoFocus
              autoComplete="tel"
              inputMode="tel"
              name="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={30}
              placeholder="081234567890"
              required
            />
          </label>
          <div className="contact-phone-hint" role="note">
            <ChatIcon name="info" size={14} />
            <span>Masukkan nomor persis seperti yang terdaftar, termasuk angka 0 di depan.</span>
          </div>
          <div className="add-contact-actions">
            <button type="button" onClick={() => {
              setPhone('')
              setIsAddFormOpen(false)
            }}>
              Batal
            </button>
            <button type="submit">Simpan</button>
          </div>
        </form>
      )}

      {outgoingContactRequests.length > 0 && (
        <section className="contact-action-list" aria-label="Permintaan kontak terkirim">
          <div className="contacts-section-heading">
            <span>MENUNGGU PERSETUJUAN</span>
            <span>{outgoingContactRequests.length}</span>
          </div>
          {outgoingContactRequests.map((request) => (
            <div className="contact-action-item" key={request.id}>
              <span className="contact-list-copy">
                <strong>{request.name}</strong>
                <small>{request.phone || (request.username ? `@${request.username}` : 'Permintaan kontak terkirim')}</small>
              </span>
              <span className="contact-pending-badge">Menunggu</span>
            </div>
          ))}
        </section>
      )}

      {contactRequests.length > 0 && (
        <section className="contact-action-list" aria-label="Permintaan kontak">
          <div className="contacts-section-heading">
            <span>PERMINTAAN KONTAK</span>
            <span>{contactRequests.length}</span>
          </div>
          {contactRequests.map((request) => (
            <div className="contact-action-item" key={request.id}>
              <span className="contact-list-copy">
                <strong>{request.name}</strong>
                <small>{request.username ? `@${request.username}` : `ID ${request.id}`}</small>
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => onRespondToContactRequest(request.id, true)}
              >
                Terima
              </button>
              <button
                className="text-button contact-reject-button"
                type="button"
                onClick={() => onRespondToContactRequest(request.id, false)}
              >
                Tolak
              </button>
            </div>
          ))}
        </section>
      )}

      {groupInvitations.length > 0 && (
        <section className="contact-action-list" aria-label="Undangan grup">
          <div className="contacts-section-heading">
            <span>UNDANGAN GRUP</span>
            <span>{groupInvitations.length}</span>
          </div>
          {groupInvitations.map((invitation) => (
            <div className="contact-action-item" key={invitation.id}>
              <span className="contact-list-copy">
                <strong>{invitation.title}</strong>
                <small>Undangan dari {invitation.inviterName}</small>
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => onRespondToGroupInvitation(invitation.id, true)}
              >
                Terima
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => onRespondToGroupInvitation(invitation.id, false)}
              >
                Tolak
              </button>
            </div>
          ))}
        </section>
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
        <span>{filteredContacts.length}</span>
      </div>

      <div className="contacts-list">
        {filteredContacts.map((contact) => (
          <button
            className="contact-list-item"
            key={contact.id}
            type="button"
            onClick={() => onSelectContact(contact)}
          >
            <ChatAvatar chat={contact} />
            <span className="contact-list-copy">
              <strong>{contact.name}</strong>
              <small>{contact.status === 'online' ? 'Online sekarang' : 'Terakhir dilihat baru-baru ini'}</small>
            </span>
            <span className={`contact-presence${contact.status === 'online' ? ' is-online' : ''}`} aria-label={contact.status === 'online' ? 'Online' : 'Offline'} />
          </button>
        ))}
        {filteredContacts.length === 0 && (
          <p className="empty-state">{contacts.length ? 'Kontak tidak ditemukan.' : 'Belum ada kontak yang diterima.'}</p>
        )}
      </div>
    </>
  )
}

export default ContactsList
