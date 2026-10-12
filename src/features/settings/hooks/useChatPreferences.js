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
    toggleNotifications: () => setPreferences((current) => ({
      ...current,
      notificationsEnabled: !current.notificationsEnabled,
    })),
    toggleReadReceipts: () => setPreferences((current) => ({
      ...current,
      readReceiptsEnabled: !current.readReceiptsEnabled,
    })),
  }
}

export default useChatPreferences
