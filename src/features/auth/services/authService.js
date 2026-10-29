import axios from 'axios'
import api from '../../../services/api'
import {
  clearAuthTokens,
  getAuthToken,
  getRefreshToken,
  saveAuthToken,
  saveRefreshToken,
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

export async function loginUser(credentials) {
  try {
    const response = await api.post('/sessions', credentials)
    saveAuthToken(response.data?.data?.token)
    saveRefreshToken(response.data?.data?.refresh_token)
    return response.data
  } catch (error) {
    throw toAuthError(error, 'Login gagal. Periksa email dan kata sandi Anda.')
  }
}

export async function refreshAuthToken(refreshToken = getRefreshToken()) {
  if (!refreshToken) {
    throw new Error('Refresh token tidak ditemukan. Silakan login kembali.')
  }

  try {
    const response = await api.post('/sessions/refresh', null, {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Accept: 'application/json',
      },
    })
    saveAuthToken(response.data?.data?.token)
    if (response.data?.data?.refresh_token) {
      saveRefreshToken(response.data.data.refresh_token)
    }
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && [401, 419].includes(error.response?.status)) {
      clearAuthTokens()
    }

    throw error
  }
}

export async function checkLogin(token) {
  try {
    await api.get('/sessions/check-session', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    return true
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      throw toAuthError(error, 'Sesi tidak dapat diverifikasi. Silakan coba lagi.')
    }
  }

  try {
    await refreshAuthToken()
    return true
  } catch (error) {
    if (axios.isAxiosError(error) && [401, 419].includes(error.response?.status)) {
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
    throw new Error('Token autentikasi tidak ditemukan. Silakan login kembali.')
  }

  try {
    let response

    try {
      response = await api.delete('/sessions', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401 || !refreshToken) {
        throw error
      }

      await refreshAuthToken(refreshToken)
      const refreshedAccessToken = getAuthToken()
      response = await api.delete('/sessions', {
        headers: {
          Authorization: `Bearer ${refreshedAccessToken}`,
          Accept: 'application/json',
        },
      })
    }

    clearAuthTokens()
    return response.data
  } catch (error) {
    throw toAuthError(error, 'Logout gagal. Silakan coba lagi.')
  }
}

export async function registerUser(registration) {
  try {
    const response = await api.post('/registers', registration)
    saveAuthToken(response.data?.data?.token)
    if (response.data?.data?.refresh_token) {
      saveRefreshToken(response.data.data.refresh_token)
    }
    return response.data
  } catch (error) {
    throw toAuthError(error, 'Pendaftaran gagal. Silakan coba lagi.')
  }
}
