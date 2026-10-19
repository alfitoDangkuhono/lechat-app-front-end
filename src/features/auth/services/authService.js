import axios from 'axios'
import api from '../../../services/api'
import { clearAuthToken, getAuthToken, saveAuthToken } from './authTokenService'

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
    const response = await api.post('/login', credentials)
    saveAuthToken(response.data?.data?.token)
    return response.data
  } catch (error) {
    throw toAuthError(error, 'Login gagal. Periksa email dan kata sandi Anda.')
  }
}

export async function checkLogin(token) {
  try {
    await api.post('/is-login', { token })
    return true
  } catch (error) {
    if (axios.isAxiosError(error) && [401, 419].includes(error.response?.status)) {
      clearAuthToken()
      return false
    }

    throw toAuthError(error, 'Sesi tidak dapat diverifikasi. Silakan coba lagi.')
  }
}

export async function logoutUser() {
  const token = getAuthToken()

  if (!token) {
    throw new Error('Token autentikasi tidak ditemukan. Silakan login kembali.')
  }

  try {
    const response = await api.post('/logout', null, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    clearAuthToken()
    return response.data
  } catch (error) {
    throw toAuthError(error, 'Logout gagal. Silakan coba lagi.')
  }
}

export async function registerUser(registration) {
  try {
    const response = await api.post('/register', registration)
    saveAuthToken(response.data?.data?.token)
    return response.data
  } catch (error) {
    throw toAuthError(error, 'Pendaftaran gagal. Silakan coba lagi.')
  }
}
