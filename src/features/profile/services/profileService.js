import api from '../../../services/api'

function firstString(...values) {
  return values.find((value) => typeof value === 'string') ?? ''
}

export async function getCurrentUserProfile() {
  const response = await api.get('/profile')
  const data = response.data?.data ?? response.data
  const profile = data?.profile ?? data?.user ?? data

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Respons profil tidak valid.')
  }

  return {
    name: firstString(
      profile.name,
      profile.full_name,
      profile.fullName,
      profile.username,
      [profile.first_name, profile.last_name].filter((part) => typeof part === 'string').join(' '),
    ),
    email: firstString(profile.email),
    phone: firstString(profile.handphone, profile.phone, profile.phone_number),
    about: firstString(profile.about, profile.bio, profile.description),
  }
}

export function profileInitials(profile) {
  const name = profile?.name?.trim()
  if (!name) return 'U'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
