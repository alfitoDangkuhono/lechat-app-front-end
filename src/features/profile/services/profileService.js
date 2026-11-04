import api from '../../../services/api'

const PROFILE_COOKIE_NAME = 'lechat_profile'
const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

function firstNonEmptyString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

function normalizeProfile(profile) {
  return {
    name: firstNonEmptyString(profile.name, profile.full_name, profile.fullName, profile.username),
    email: firstNonEmptyString(profile.email),
    phone: firstNonEmptyString(profile.handphone, profile.phone, profile.phone_number),
    about: firstNonEmptyString(profile.about, profile.bio, profile.description),
  }
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
  const data = response.data?.data ?? response.data
  const profile = data?.profile ?? data?.user ?? data

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Respons profil tidak valid.')
  }

  const name = firstNonEmptyString(
    profile.name,
    profile.full_name,
    profile.fullName,
    profile.username,
    [profile.first_name, profile.last_name]
      .filter((part) => typeof part === 'string')
      .join(' '),
  )

  return normalizeProfile({ ...profile, name })
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

    return normalizeProfile(profile)
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
