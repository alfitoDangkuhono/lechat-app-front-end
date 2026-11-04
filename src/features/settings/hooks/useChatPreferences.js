import { useEffect, useState } from 'react'
import { getChatPreferences, saveChatPreferences } from '../services/settingsService'

function useChatPreferences() {
  const [preferences, setPreferences] = useState(getChatPreferences)

  useEffect(() => {
    saveChatPreferences(preferences)
  }, [preferences])

  return {
    notificationsEnabled: preferences.notificationsEnabled,
    readReceiptsEnabled: preferences.readReceiptsEnabled,
    messageFontSize: preferences.messageFontSize,
    messageFontFamily: preferences.messageFontFamily,
    toggleNotifications: () => setPreferences((current) => ({
      ...current,
      notificationsEnabled: !current.notificationsEnabled,
    })),
    toggleReadReceipts: () => setPreferences((current) => ({
      ...current,
      readReceiptsEnabled: !current.readReceiptsEnabled,
    })),
    setMessageFontSize: (messageFontSize) => setPreferences((current) => ({
      ...current,
      messageFontSize,
    })),
    setMessageFontFamily: (messageFontFamily) => setPreferences((current) => ({
      ...current,
      messageFontFamily,
    })),
  }
}

export default useChatPreferences
