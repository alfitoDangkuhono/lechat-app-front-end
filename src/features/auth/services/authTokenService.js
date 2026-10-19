const AUTH_TOKEN_COOKIE = 'auth_token'

export function saveAuthToken(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('Token autentikasi tidak valid.')
  }

  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttribute}`
}

export function getAuthToken() {
  const cookiePrefix = `${AUTH_TOKEN_COOKIE}=`
  const tokenCookie = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(cookiePrefix))

  if (!tokenCookie) {
    return null
  }

  try {
    return decodeURIComponent(tokenCookie.slice(cookiePrefix.length))
  } catch (error) {
    if (!(error instanceof URIError)) {
      throw error
    }

    clearAuthToken()
    return null
  }
}

export function clearAuthToken() {
  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${AUTH_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureAttribute}`
}
