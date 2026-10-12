import { useState } from 'react'
import { LoginPage, RegisterPage } from './features/auth'
import { Dashboard } from './features/chat'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authPage, setAuthPage] = useState('login')

  if (!isLoggedIn) {
    if (authPage === 'register') {
      return (
        <RegisterPage
          onLogin={() => setAuthPage('login')}
          onRegister={() => setIsLoggedIn(true)}
        />
      )
    }

    return (
      <LoginPage
        onLogin={() => setIsLoggedIn(true)}
        onRegister={() => setAuthPage('register')}
      />
    )
  }

  return <Dashboard />
}

export default App
