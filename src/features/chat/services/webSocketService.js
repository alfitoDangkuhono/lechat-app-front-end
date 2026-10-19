import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

let echo = null

export function connectWebSocket() {
  if (echo) {
    return echo
  }

  const key = import.meta.env.VITE_REVERB_APP_KEY
  if (!key) {
    throw new Error('VITE_REVERB_APP_KEY wajib diisi sebelum menghubungkan Reverb.')
  }

  const port = Number(import.meta.env.VITE_REVERB_PORT || 18081)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_REVERB_PORT harus berupa nomor port yang valid.')
  }

  echo = new Echo({
    broadcaster: 'reverb',
    key,
    Pusher,
    wsHost: import.meta.env.VITE_REVERB_HOST || '127.0.0.1',
    wsPort: port,
    wssPort: port,
    forceTLS: false,
    enabledTransports: ['ws'],
  })

  return echo
}

export function disconnectWebSocket() {
  if (!echo) {
    return
  }

  echo.disconnect()
  echo = null
}
