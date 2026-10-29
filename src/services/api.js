import axios from 'axios'
import { clearAuthTokens } from '../features/auth/services/authTokenService'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4000'

export function apiBaseUrl(
  baseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
) {
  const normalizedBaseUrl = (baseUrl.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '')

  return normalizedBaseUrl.endsWith('/api/v1')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api/v1`
}

const api = axios.create({
  baseURL: apiBaseUrl(),
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message

    if (typeof message === 'string' && message.trim().toLowerCase() === 'unauthenticated.') {
      clearAuthTokens()
    }

    return Promise.reject(error)
  },
)

export default api
