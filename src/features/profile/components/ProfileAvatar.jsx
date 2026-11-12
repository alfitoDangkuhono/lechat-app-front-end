import { useState } from 'react'

function ProfileAvatar({ src, initials, alt = '', onExpired }) {
  const [failedSrc, setFailedSrc] = useState('')

  if (!src || src === failedSrc) return initials

  return (
    <span className="profile-avatar-content">
      <img
        className="profile-avatar-image"
        src={src}
        alt={alt}
        onError={() => {
          setFailedSrc(src)
          onExpired?.()
        }}
      />
    </span>
  )
}

export default ProfileAvatar
