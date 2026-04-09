import { createContext, useCallback, useMemo, useState } from 'react'

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
    () => localStorage.getItem('recommendation_model_token') || ''
  )
  const [user, setUser] = useState(
    () => parseStoredUser(localStorage.getItem('recommendation_model_user'))
  )

  const login = useCallback(({ token: nextToken, user: nextUser }) => {
    localStorage.setItem('recommendation_model_token', nextToken)
    localStorage.setItem('recommendation_model_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('recommendation_model_token')
    localStorage.removeItem('recommendation_model_user')
    setToken('')
    setUser(null)
  }, [])

  const updateUser = useCallback((nextUser) => {
    localStorage.setItem('recommendation_model_user', JSON.stringify(nextUser))
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
