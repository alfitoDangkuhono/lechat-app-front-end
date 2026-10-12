export { default as SettingsPanel } from './components/SettingsPanel'
export { default as useChatPreferences } from './hooks/useChatPreferences'
export { default as useTheme } from './hooks/useTheme'
export {
  getChatPreferences,
  getThemePreference,
  saveChatPreferences,
  saveThemePreference,
} from './services/settingsService'
