const THEME_STORAGE_KEY = 'lechat-theme'
const NOTIFICATIONS_STORAGE_KEY = 'lechat-notifications'
const READ_RECEIPTS_STORAGE_KEY = 'lechat-read-receipts'

export function getThemePreference() {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export function saveThemePreference(theme) {
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error('Tema tidak valid.')
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function getChatPreferences() {
  return {
    notificationsEnabled: localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false',
    readReceiptsEnabled: localStorage.getItem(READ_RECEIPTS_STORAGE_KEY) !== 'false',
  }
}

export function saveChatPreferences({ notificationsEnabled, readReceiptsEnabled }) {
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(notificationsEnabled))
  localStorage.setItem(READ_RECEIPTS_STORAGE_KEY, String(readReceiptsEnabled))
}
