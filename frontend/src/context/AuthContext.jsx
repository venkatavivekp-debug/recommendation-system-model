import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { getLocalItem, removeLocalItem, setLocalItem } from '../utils/storage'
import { SESSION_INVALIDATED_EVENT } from '../services/api/session'

const AuthContext = createContext(null)

function parseStoredUser(raw) {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => getLocalItem('recommendation_model_token')
  )
  const [user, setUser] = useState(
    () => parseStoredUser(getLocalItem('recommendation_model_user'))
  )

  useEffect(() => {
    const clearExpiredSession = () => {
      setToken('')
      setUser(null)
    }

    window.addEventListener(SESSION_INVALIDATED_EVENT, clearExpiredSession)
    return () => window.removeEventListener(SESSION_INVALIDATED_EVENT, clearExpiredSession)
  }, [])

  const login = useCallback(({ token: nextToken, user: nextUser }) => {
    setLocalItem('recommendation_model_token', nextToken)
    setLocalItem('recommendation_model_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  const logout = useCallback(() => {
    removeLocalItem('recommendation_model_token')
    removeLocalItem('recommendation_model_user')
    setToken('')
    setUser(null)
  }, [])

  const updateUser = useCallback((nextUser) => {
    setLocalItem('recommendation_model_user', JSON.stringify(nextUser))
    setUser(nextUser)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      logout,
      updateUser,
    }),
    [token, user, login, logout, updateUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
