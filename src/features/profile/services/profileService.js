import api from '../../../services/api'

const PROFILE_COOKIE_NAME = 'lechat_profile'
const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const AVATAR_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function firstNonEmptyString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

function normalizeProfile(profile) {
  const firstName = firstNonEmptyString(profile.first_name)
  const lastName = firstNonEmptyString(profile.last_name)
  const name = firstNonEmptyString(
    profile.name,
    profile.full_name,
    profile.fullName,
    [firstName, lastName].filter(Boolean).join(' '),
    profile.username,
  )

  return {
    id: profile.id ?? null,
    username: firstNonEmptyString(profile.username),
    first_name: firstName,
    last_name: lastName,
    name,
    email: firstNonEmptyString(profile.email),
    phone: firstNonEmptyString(profile.phone, profile.handphone, profile.phone_number),
    about: firstNonEmptyString(profile.about, profile.bio, profile.description),
    avatar_url: typeof profile.avatar_url === 'string' && profile.avatar_url
      ? profile.avatar_url
      : null,
    avatar_url_expires_in: Number.isFinite(profile.avatar_url_expires_in)
      && profile.avatar_url_expires_in > 0
      ? profile.avatar_url_expires_in
      : null,
  }
}

function getResponseData(response) {
  return response.data?.data ?? response.data
}

function getProfileFromResponse(response) {
  const data = getResponseData(response)
  const profile = data?.profile ?? data?.user ?? data

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Respons profil tidak valid.')
  }

  const currentProfile = normalizeProfile(profile)
  saveCachedCurrentUserProfile(currentProfile)
  return currentProfile
}

function getProfileCookie() {
  const cookiePrefix = `${PROFILE_COOKIE_NAME}=`
  return document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(cookiePrefix))
    ?.slice(cookiePrefix.length) ?? null
}

function profileCookieAttributes() {
  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
  return `Path=/; SameSite=Lax${secureAttribute}`
}

export async function getCurrentUserProfile() {
  const response = await api.get('/profile')
  return getProfileFromResponse(response)
}

export async function updateCurrentUserProfile(profile) {
  const editableFields = ['first_name', 'last_name', 'phone', 'about']
  const payload = {}

  for (const field of editableFields) {
    if (typeof profile?.[field] !== 'string' || !profile[field].trim()) {
      throw new Error('Nama depan, nama belakang, nomor telepon, dan tentang wajib diisi.')
    }
    payload[field] = profile[field].trim()
  }

  const response = await api.post('/profile', payload)
  return getProfileFromResponse(response)
}

export async function uploadCurrentUserAvatar(file) {
  if (!file || !AVATAR_CONTENT_TYPES.has(file.type)) {
    throw new Error('Pilih gambar JPEG, PNG, atau WebP.')
  }

  const response = await api.post('/profile/avatar/upload-url', {
    content_type: file.type,
  })
  const upload = getResponseData(response)

  if (
    typeof upload?.upload_url !== 'string'
    || !upload.upload_url
    || typeof upload.method !== 'string'
    || upload.method.toUpperCase() !== 'PUT'
    || !upload.headers
    || typeof upload.headers !== 'object'
    || Array.isArray(upload.headers)
    || typeof upload.avatar_url !== 'string'
    || !upload.avatar_url
  ) {
    throw new Error('Respons URL unggah avatar tidak valid.')
  }

  let uploadResponse
  try {
    uploadResponse = await fetch(upload.upload_url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    })
  } catch {
    throw new Error('Unggah avatar gagal. Periksa koneksi dan izin CORS bucket, lalu coba lagi.')
  }

  if (!uploadResponse.ok) {
    throw new Error(`Unggah avatar gagal (HTTP ${uploadResponse.status}).`)
  }

  return upload.avatar_url
}

export async function getCurrentUserAvatarDownloadUrl() {
  const response = await api.get('/profile/avatar/download-url')
  const download = getResponseData(response)

  if (
    typeof download?.download_url !== 'string'
    || !download.download_url
    || !Number.isFinite(download.expires_in)
    || download.expires_in <= 0
  ) {
    throw new Error('Respons URL unduh avatar tidak valid.')
  }

  return {
    downloadUrl: download.download_url,
    expiresIn: download.expires_in,
  }
}

export function getCachedCurrentUserProfile() {
  const cookie = getProfileCookie()
  if (!cookie) return null

  try {
    const profile = JSON.parse(decodeURIComponent(cookie))
    if (
      !profile
      || typeof profile !== 'object'
      || Array.isArray(profile)
      || ['name', 'email', 'phone', 'about'].some((key) => typeof profile[key] !== 'string')
    ) {
      clearCachedCurrentUserProfile()
      return null
    }

    const cachedProfile = normalizeProfile({
      ...profile,
      avatar_url: null,
      avatar_url_expires_in: null,
    })
    saveCachedCurrentUserProfile(cachedProfile)
    return cachedProfile
  } catch (error) {
    if (!(error instanceof URIError) && !(error instanceof SyntaxError)) {
      throw error
    }

    clearCachedCurrentUserProfile()
    return null
  }
}

export function saveCachedCurrentUserProfile(profile) {
  const cachedProfile = normalizeProfile(profile)
  cachedProfile.avatar_url = null
  cachedProfile.avatar_url_expires_in = null
  document.cookie = `${PROFILE_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(cachedProfile))}; ${profileCookieAttributes()}; Max-Age=${PROFILE_COOKIE_MAX_AGE}`
}

export function clearCachedCurrentUserProfile() {
  document.cookie = `${PROFILE_COOKIE_NAME}=; ${profileCookieAttributes()}; Max-Age=0`
}

export function profileInitials(profile) {
  const name = profile?.name?.trim()
  if (!name) return ''
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
