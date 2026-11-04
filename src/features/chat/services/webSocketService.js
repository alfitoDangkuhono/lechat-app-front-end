import { API_BASE_URL } from '../../../services/api'
import { checkLogin } from '../../auth/services/authService'
import { getAuthToken } from '../../auth/services/authTokenService'

const connections = new Set()

function getWebSocketUrl() {
  const configuredUrl = import.meta.env.VITE_WS_URL
  if (configuredUrl) return configuredUrl

  const apiUrl = new URL(API_BASE_URL)
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  apiUrl.pathname = `${apiUrl.pathname.replace(/\/+$/, '')}/ws`
  return apiUrl.toString()
}

export function connectWebSocket({ conversationId, onEvent, onStatus }) {
  let socket = null
  let disposed = false
  let joined = false
  let retryCount = 0
  let retryTimer = null
  const connection = {
    send(frame) {
      if (!joined || socket?.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify(frame))
      return true
    },
    disconnect() {
      disposed = true
      joined = false
      window.clearTimeout(retryTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
      connections.delete(connection)
    },
  }

  async function connect(isRetry = false) {
    if (disposed) return

    if (isRetry) {
      try {
        const token = getAuthToken()
        if (!token || !(await checkLogin(token))) {
          onStatus?.('auth-error')
          return
        }
      } catch {
        if (disposed) return
        onStatus?.('error')
        scheduleReconnect()
        return
      }
    }

    const token = getAuthToken()
    if (!token) {
      onStatus?.('auth-error')
      return
    }

    joined = false
    onStatus?.('connecting')
    try {
      socket = new WebSocket(getWebSocketUrl())
    } catch {
      onStatus?.('error')
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      if (disposed) return
      onStatus?.('authenticating')
      socket.send(JSON.stringify({ type: 'auth', token }))
    }

    socket.onmessage = (message) => {
      if (disposed) return

      let event
      try {
        event = JSON.parse(message.data)
      } catch {
        onStatus?.('error')
        return
      }

      if (event.type === 'auth.ok') {
        if (conversationId) {
          onStatus?.('joining')
          socket.send(JSON.stringify({
            type: 'conversation.join',
            conversation_id: conversationId,
            limit: 50,
          }))
        } else {
          retryCount = 0
          onStatus?.('connected')
        }
      }

      if (event.type === 'conversation.history' && event.data?.joined === true) {
        joined = true
        retryCount = 0
        onStatus?.('connected')
      }

      onEvent?.(event)
    }

    socket.onerror = () => {
      if (!disposed) onStatus?.('error')
    }

    socket.onclose = () => {
      if (disposed) return
      joined = false
      onStatus?.('disconnected')
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (disposed || retryTimer !== null) return
    const backoff = Math.min(1000 * (2 ** retryCount), 15000)
    retryCount += 1
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      connect(true)
    }, backoff + Math.random() * 500)
  }

  connections.add(connection)
  connect()
  return connection
}

export function disconnectWebSocket() {
  for (const connection of [...connections]) {
    connection.disconnect()
  }
}
