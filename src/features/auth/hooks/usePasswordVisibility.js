import { useState } from 'react'

function usePasswordVisibility() {
  const [isVisible, setIsVisible] = useState(false)

  function toggleVisibility() {
    setIsVisible((current) => !current)
  }

  return { isVisible, toggleVisibility }
}

export default usePasswordVisibility
