export { default as Dashboard } from './components/Dashboard'
export { chatService } from './services/chatService'
export { connectWebSocket, disconnectWebSocket } from './services/webSocketService'
export {
  getChatPreferences,
  getThemePreference,
  saveChatPreferences,
  saveThemePreference,
} from '../settings'