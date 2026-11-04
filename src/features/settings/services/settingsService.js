const THEME_STORAGE_KEY = 'lechat-theme'
const NOTIFICATIONS_STORAGE_KEY = 'lechat-notifications'
const READ_RECEIPTS_STORAGE_KEY = 'lechat-read-receipts'
const MESSAGE_FONT_SIZE_STORAGE_KEY = 'lechat-message-font-size'
const MESSAGE_FONT_FAMILY_STORAGE_KEY = 'lechat-message-font-family'
const MESSAGE_FONT_SIZES = ['small', 'medium', 'large']
const MESSAGE_FONT_FAMILIES = ['system', 'serif', 'monospace']

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
  const savedMessageFontSize = localStorage.getItem(MESSAGE_FONT_SIZE_STORAGE_KEY)
  const savedMessageFontFamily = localStorage.getItem(MESSAGE_FONT_FAMILY_STORAGE_KEY)

  return {
    notificationsEnabled: localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false',
    readReceiptsEnabled: localStorage.getItem(READ_RECEIPTS_STORAGE_KEY) !== 'false',
    messageFontSize: MESSAGE_FONT_SIZES.includes(savedMessageFontSize) ? savedMessageFontSize : 'medium',
    messageFontFamily: MESSAGE_FONT_FAMILIES.includes(savedMessageFontFamily) ? savedMessageFontFamily : 'system',
  }
}

export function saveChatPreferences({
  notificationsEnabled,
  readReceiptsEnabled,
  messageFontSize,
  messageFontFamily,
}) {
  if (!MESSAGE_FONT_SIZES.includes(messageFontSize)) {
    throw new Error('Ukuran teks pesan tidak valid.')
  }
  if (!MESSAGE_FONT_FAMILIES.includes(messageFontFamily)) {
    throw new Error('Jenis font pesan tidak valid.')
  }

  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(notificationsEnabled))
  localStorage.setItem(READ_RECEIPTS_STORAGE_KEY, String(readReceiptsEnabled))
  localStorage.setItem(MESSAGE_FONT_SIZE_STORAGE_KEY, messageFontSize)
  localStorage.setItem(MESSAGE_FONT_FAMILY_STORAGE_KEY, messageFontFamily)
}
