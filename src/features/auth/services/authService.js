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
    await api.get('/sessions/check-session', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return true
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
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
