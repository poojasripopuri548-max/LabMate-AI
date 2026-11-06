import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authService } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = authService.getStoredUser()
    const token = localStorage.getItem('labmate_token')
    if (stored && token) {
      authService.getProfile()
        .then(() => setUser(stored))
        .catch(() => {
          authService.logout()
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      authService.logout()
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const loggedIn = await authService.login(credentials)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const register = useCallback(async (data) => {
    const created = await authService.register(data)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
