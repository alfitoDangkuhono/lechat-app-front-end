const AUTH_TOKEN_COOKIE = 'auth_token'
const REFRESH_TOKEN_COOKIE = 'refresh_token'

function saveTokenCookie(cookieName, token, tokenType) {
  if (typeof token !== 'string' || !token) {
    throw new Error(`Token ${tokenType} tidak valid.`)
  }

  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${cookieName}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttribute}`
}

function getTokenCookie(cookieName) {
  const cookiePrefix = `${cookieName}=`
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

    clearTokenCookie(cookieName)
    return null
  }
}

function clearTokenCookie(cookieName) {
  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax${secureAttribute}`
}

export function saveAuthToken(token) {
  saveTokenCookie(AUTH_TOKEN_COOKIE, token, 'autentikasi')
}

export function getAuthToken() {
  return getTokenCookie(AUTH_TOKEN_COOKIE)
}

export function clearAuthToken() {
  clearTokenCookie(AUTH_TOKEN_COOKIE)
}

export function saveRefreshToken(token) {
  saveTokenCookie(REFRESH_TOKEN_COOKIE, token, 'refresh')
}

export function saveAuthTokens(accessToken, refreshToken) {
  if (
    typeof accessToken !== 'string'
    || !accessToken
    || typeof refreshToken !== 'string'
    || !refreshToken
  ) {
    throw new Error('Pasangan token autentikasi tidak valid.')
  }

  saveAuthToken(accessToken)
  saveRefreshToken(refreshToken)
}

export function getRefreshToken() {
  return getTokenCookie(REFRESH_TOKEN_COOKIE)
}

export function clearRefreshToken() {
  clearTokenCookie(REFRESH_TOKEN_COOKIE)
}

export function clearAuthTokens() {
  clearAuthToken()
  clearRefreshToken()
}
