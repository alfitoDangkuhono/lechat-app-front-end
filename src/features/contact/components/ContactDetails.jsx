import { useMemo, useState } from 'react'
import ChatAvatar from '../../chat/components/ChatAvatar'
import ChatIcon from '../../chat/components/ChatIcon'

function ContactDetails({
  chat,
  contacts,
  members,
  membersError,
  isLoadingMembers,
  canInviteMembers,
  isLoadingContacts,
  contactsError,
  onLoadContacts,
  onRetryLoadMembers,
  onRefreshMembers,
  onClose,
  onViewMedia,
  onFileAction,
  onCall,
  onInviteMember,
  onNotice,
}) {
  const [isInvitePickerOpen, setIsInvitePickerOpen] = useState(false)
  const [invitingUserId, setInvitingUserId] = useState(null)
  const isGroup = chat.status === 'group'
  const detailTitle = isGroup ? 'DETAIL GRUP' : 'DETAIL KONTAK'
  const panelLabel = isGroup ? `Detail grup ${chat.name}` : `Detail kontak ${chat.name}`
  const statusLabel = chat.status === 'online'
    ? 'Aktif sekarang'
    : isGroup
      ? 'Grup percakapan'
      : 'Terakhir dilihat hari ini'
  const existingMemberIds = useMemo(() => new Set(
    members
      .map((member) => member.user_id ?? member.userId ?? member.id)
      .filter((id) => id !== undefined && id !== null)
      .map(String),
  ), [members])

  async function openInvitePicker() {
    setIsInvitePickerOpen(true)
    await onLoadContacts()
  }

  async function inviteContact(contact) {
    setInvitingUserId(String(contact.id))
    try {
      const invited = await onInviteMember(contact.id)
      if (invited) {
        setIsInvitePickerOpen(false)
        await onRefreshMembers()
      }
    } finally {
      setInvitingUserId(null)
    }
  }

  return (
    <aside className="details-panel" id="contact-details-panel" aria-label={panelLabel}>
      <div className="details-topline">
        <span>{detailTitle}</span>
        <button className="icon-button" type="button" aria-label={`Tutup ${detailTitle.toLowerCase()}`} onClick={onClose}>
          <ChatIcon name="close" size={18} />
        </button>
      </div>
      <div className="contact-card">
        <div className="contact-avatar-wrap">
          <ChatAvatar chat={chat} />
        </div>
        <h2>{chat.name}</h2>
        <p className="contact-status">
          <span className={chat.status === 'online' ? 'status-dot' : 'status-dot status-dot-muted'} />
          {statusLabel}
        </p>
        <div className="contact-actions">
          <button type="button" aria-label="Panggilan suara" onClick={onCall}><ChatIcon name="phone" size={18} /><span>Telepon</span></button>
          <button type="button" aria-label="Panggilan video" onClick={onCall}><ChatIcon name="video" size={18} /><span>Video</span></button>
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-section-title"><strong>Media bersama</strong><button className="text-button" type="button" onClick={onViewMedia}>Lihat semua</button></div>
        <div className="media-grid">
          <button type="button" className="media-tile media-one" aria-label="Lihat media contoh 1" onClick={onViewMedia}><span>🌿</span></button>
          <button type="button" className="media-tile media-two" aria-label="Lihat media contoh 2" onClick={onViewMedia}><span>☕</span></button>
          <button type="button" className="media-tile media-three" aria-label="Lihat media contoh 3" onClick={onViewMedia}><span>🌇</span></button>
        </div>
        <span className="media-caption">12 foto · 3 dokumen</span>
      </div>
      {isGroup && (
        <div className="detail-section">
          <div className="detail-section-title">
            <strong>Anggota grup</strong>
            {!isLoadingMembers && !membersError && <span>{members.length}</span>}
          </div>
          {isLoadingMembers ? (
            <p className="group-members-status" role="status">Memuat anggota grup...</p>
          ) : membersError ? (
            <div className="group-members-error" role="alert">
              <span>{membersError}</span>
              <button type="button" onClick={onRetryLoadMembers}>Coba lagi</button>
            </div>
          ) : members.length > 0 ? (
            <div className="group-members-list">
              {members.map((member) => (
                <div className="group-member-item" key={member.user_id ?? member.id}>
                  <ChatAvatar chat={member} />
                  <span className="contact-list-copy">
                    <strong>{member.name}</strong>
                    <small>@{member.username || member.name}</small>
                  </span>
                  <span className={`group-member-role role-${String(member.role).toLowerCase()}`}>
                    {member.role === 'owner'
                      ? 'Pemilik'
                      : member.role === 'admin'
                        ? 'Admin'
                        : 'Anggota'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="group-members-status">Daftar anggota grup belum tersedia.</p>
          )}
          {canInviteMembers && (
            <div className="group-invite-actions">
              <button type="button" onClick={openInvitePicker}>
                <ChatIcon name="users" size={17} />
                <span>Tambah anggota</span>
              </button>
              <button
                type="button"
                onClick={() => onNotice('Tautan undangan grup belum tersedia dari backend.')}
              >
                <ChatIcon name="link" size={17} />
                <span>Buat tautan</span>
              </button>
            </div>
          )}
        </div>
      )}
      <div className="detail-section shared-files">
        <div className="detail-section-title"><strong>File dibagikan</strong><button className="more-button" type="button" aria-label="Opsi file" onClick={onFileAction}><ChatIcon name="more" size={18} /></button></div>
        <button className="file-card" type="button" onClick={onFileAction}>
          <span className="file-icon">PDF</span>
          <span className="file-copy"><strong>Itinerary weekend.pdf</strong><small>2.4 MB · 12 Okt 2026</small></span>
          <ChatIcon name="more" size={18} />
        </button>
      </div>
      <div className="encryption-note">
        <span className="lock-icon">✦</span>
        <span>{isGroup
          ? `Detail dan anggota percakapan grup ${chat.name}.`
          : `Pesanmu aman dan hanya bisa dibaca oleh kamu dan ${chat.name.split(' ')[0]}.`}</span>
      </div>
      {isInvitePickerOpen && (
        <div
          className="group-invite-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsInvitePickerOpen(false)
          }}
        >
          <section
            className="group-invite-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-invite-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsInvitePickerOpen(false)
            }}
          >
            <div className="group-invite-heading">
              <div>
                <span className="eyebrow">ANGGOTA GRUP</span>
                <h2 id="group-invite-title">Undang anggota</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Tutup daftar kontak"
                onClick={() => setIsInvitePickerOpen(false)}
              >
                <ChatIcon name="close" size={18} />
              </button>
            </div>
            <div className="group-invite-list">
              {isLoadingContacts ? (
                <p className="empty-state" role="status">Memuat daftar kontak...</p>
              ) : contactsError ? (
                <div className="group-invite-empty" role="alert">
                  <p>{contactsError}</p>
                  <button type="button" onClick={onLoadContacts}>Coba lagi</button>
                </div>
              ) : contacts.length === 0 ? (
                <p className="empty-state">Belum ada kontak yang dapat diundang.</p>
              ) : contacts.map((contact) => {
                const isMember = existingMemberIds.has(String(contact.id))
                const isInviting = invitingUserId === String(contact.id)
                return (
                  <div className="group-invite-contact" key={contact.id}>
                    <ChatAvatar chat={contact} />
                    <span className="contact-list-copy">
                      <strong>{contact.name}</strong>
                      <small>{contact.status === 'online' ? 'Online sekarang' : 'Kontak'}</small>
                    </span>
                    <button
                      type="button"
                      disabled={isMember || invitingUserId !== null}
                      onClick={() => inviteContact(contact)}
                    >
                      {isMember ? 'Anggota' : isInviting ? 'Mengundang...' : 'Undang'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </aside>
  )
}

export default ContactDetails
