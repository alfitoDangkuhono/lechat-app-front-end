import axios from 'axios'
import api, { refreshAuthSession } from '../../../services/api'
import {
  clearAuthTokens,
  getAuthToken,
  getRefreshToken,
  saveAuthTokens,
} from './authTokenService'

function toAuthError(error, fallbackMessage) {
  if (!axios.isAxiosError(error)) {
    return error
  }

  const responseData = error.response?.data
  const validationMessage = Object.values(responseData?.errors ?? {})
    .flat()
    .find((message) => typeof message === 'string')
  const message = validationMessage
    ?? responseData?.message
    ?? fallbackMessage

  return new Error(message, { cause: error })
}

function storeSession(response) {
  const tokens = response.data?.data
  saveAuthTokens(tokens?.token, tokens?.refresh_token)
  return response.data
}

function verifySession(token) {
  return api.get('/sessions/check-session', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

function hasUnauthorizedCode(payload, depth = 0) {
  if (!payload || depth > 5) return false

  if (typeof payload === 'string') {
    try {
      return hasUnauthorizedCode(JSON.parse(payload), depth + 1)
    } catch (error) {
      if (error instanceof SyntaxError) return false
      throw error
    }
  }

  if (typeof payload !== 'object') return false
  if ([401, 419].includes(Number(payload.code))) return true

  return ['data', 'response', 'error'].some((key) => (
    hasUnauthorizedCode(payload[key], depth + 1)
  ))
}

function isSessionUnauthorized(response) {
  return [401, 419].includes(Number(response.status))
    || hasUnauthorizedCode(response.data)
}

function isUnauthorizedHttpError(error) {
  return axios.isAxiosError(error) && [401, 419].includes(error.response?.status)
}

function isUnauthorizedError(error) {
  const cause = axios.isAxiosError(error) ? error : error?.cause
  return axios.isAxiosError(cause) && [401, 419].includes(cause.response?.status)
}

export async function loginUser(credentials) {
  try {
    const response = await api.post('/sessions', credentials)
    return storeSession(response)
  } catch (error) {
    throw toAuthError(error, 'Login gagal. Periksa email dan kata sandi Anda.')
  }
}

export async function refreshAuthToken(refreshToken = getRefreshToken()) {
  if (!refreshToken) {
    throw new Error('Refresh token tidak ditemukan. Silakan login kembali.')
  }

  try {
    return await refreshAuthSession(refreshToken)
  } catch (error) {
    if (axios.isAxiosError(error) && [401, 419].includes(error.response?.status)) {
      clearAuthTokens()
    }

    throw toAuthError(error, 'Sesi tidak dapat diperbarui. Silakan login kembali.')
  }
}

export async function checkLogin(token = getAuthToken()) {
  if (!token) {
    clearAuthTokens()
    return false
  }

  try {
    const response = await verifySession(token)
    if (!isSessionUnauthorized(response)) return true
    if (response.config?._retry) {
      clearAuthTokens()
      return false
    }
  } catch (error) {
    if (!isUnauthorizedHttpError(error)) {
      throw toAuthError(error, 'Sesi tidak dapat diverifikasi. Silakan coba lagi.')
    }
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearAuthTokens()
    return false
  }

  try {
    await refreshAuthToken(refreshToken)
  } catch (error) {
    if (isUnauthorizedError(error)) {
      clearAuthTokens()
      return false
    }

    throw error
  }

  const refreshedAccessToken = getAuthToken()
  if (!refreshedAccessToken) {
    clearAuthTokens()
    return false
  }

  try {
    const response = await verifySession(refreshedAccessToken)
    if (isSessionUnauthorized(response)) {
      clearAuthTokens()
      return false
    }
    return true
  } catch (error) {
    if (isUnauthorizedHttpError(error)) {
      clearAuthTokens()
      return false
    }

    throw toAuthError(error, 'Sesi tidak dapat diverifikasi. Silakan coba lagi.')
  }
}

export async function logoutUser() {
  const token = getAuthToken()
  const refreshToken = getRefreshToken()

  if (!token) {
    clearAuthTokens()
    return null
  }

  try {
    try {
      const response = await api.delete('/sessions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      clearAuthTokens()
      return response.data
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401 || !refreshToken) {
        throw error
      }

      await refreshAuthToken(refreshToken)
      const refreshedAccessToken = getAuthToken()
      const response = await api.delete('/sessions', {
        headers: {
          Authorization: `Bearer ${refreshedAccessToken}`,
        },
      })
      clearAuthTokens()
      return response.data
    }
  } catch (error) {
    clearAuthTokens()
    throw toAuthError(error, 'Logout gagal. Silakan coba lagi.')
  }
}

export async function registerUser(registration) {
  try {
    const response = await api.post('/registers', registration)
    return storeSession(response)
  } catch (error) {
    throw toAuthError(error, 'Pendaftaran gagal. Silakan coba lagi.')
  }
}
