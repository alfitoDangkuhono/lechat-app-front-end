import { useEffect, useState } from 'react'
import { getThemePreference, saveThemePreference } from '../services/settingsService'

function getInitialTheme() {
  return getThemePreference()
}

function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveThemePreference(theme)
  }, [theme])

  function toggleTheme() {
    setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggleTheme }
}

export default useTheme
