import axios from 'axios'
import {
  clearAuthTokens,
  getAuthToken,
  getRefreshToken,
  saveAuthTokens,
} from '../features/auth/services/authTokenService'

const DEFAULT_API_BASE_URL = 'http://localhost:8989/api/v1'

export function apiBaseUrl(
  baseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
) {
  const normalizedBaseUrl = (baseUrl.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '')

  return normalizedBaseUrl.endsWith('/api/v1')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api/v1`
}

export const API_BASE_URL = apiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: 'application/json',
  },
})

let refreshPromise

function notifySessionExpired() {
  clearAuthTokens()
  window.dispatchEvent(new Event('lechat:session-expired'))
}

function refreshSession(refreshToken = getRefreshToken()) {
  if (!refreshPromise) {
    if (!refreshToken) {
      return Promise.reject(new Error('Refresh token tidak ditemukan. Silakan login kembali.'))
    }

    refreshPromise = axios.post(`${API_BASE_URL}/sessions/refresh`, null, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
    })
      .then((response) => {
        const tokens = response.data?.data
        if (
          typeof tokens?.token !== 'string'
          || !tokens.token
          || typeof tokens?.refresh_token !== 'string'
          || !tokens.refresh_token
        ) {
          throw new Error('Respons refresh tidak berisi pasangan token yang valid.')
        }

        saveAuthTokens(tokens.token, tokens.refresh_token)
        return response.data
      })
      .catch((error) => {
        if ([401, 419].includes(error.response?.status)) {
          notifySessionExpired()
        }
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export function refreshAuthSession(refreshToken) {
  return refreshSession(refreshToken)
}

api.interceptors.request.use((config) => {
  const authorization = config.headers?.Authorization
    ?? config.headers?.get?.('Authorization')
  const token = getAuthToken()

  if (!authorization && token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const responseData = error.response?.data
    const validationMessage = Object.values(responseData?.errors ?? {})
      .flat()
      .find((message) => typeof message === 'string')
    if (typeof validationMessage === 'string') {
      error.message = validationMessage
    } else if (typeof responseData?.message === 'string') {
      error.message = responseData.message
    }

    const request = error.config
    const isUnauthorized = error.response?.status === 401
    const url = request?.url ?? ''
    const isSessionRequest = (
      url === '/sessions'
      || url === '/sessions/'
      || url.includes('/sessions/refresh')
      || url.includes('/registers')
    )

    if (!isUnauthorized || !request || isSessionRequest) {
      return Promise.reject(error)
    }

    if (request._retry || !getRefreshToken()) {
      notifySessionExpired()
      return Promise.reject(error)
    }

    request._retry = true

    try {
      const session = await refreshSession()
      request.headers.Authorization = `Bearer ${session.data.token}`
      return await api.request(request)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)

export default api
