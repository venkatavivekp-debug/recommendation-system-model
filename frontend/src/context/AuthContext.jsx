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
    () =>
      localStorage.getItem('contextfit_token') ||
      localStorage.getItem('bfit_token') ||
      localStorage.getItem('foodfit_token') ||
      ''
  )
  const [user, setUser] = useState(
    () =>
      parseStoredUser(
        localStorage.getItem('contextfit_user') ||
          localStorage.getItem('bfit_user') ||
          localStorage.getItem('foodfit_user')
      )
  )

  const login = useCallback(({ token: nextToken, user: nextUser }) => {
    localStorage.setItem('contextfit_token', nextToken)
    localStorage.setItem('contextfit_user', JSON.stringify(nextUser))
    localStorage.setItem('bfit_token', nextToken)
    localStorage.setItem('bfit_user', JSON.stringify(nextUser))
    localStorage.setItem('foodfit_token', nextToken)
    localStorage.setItem('foodfit_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('contextfit_token')
    localStorage.removeItem('contextfit_user')
    localStorage.removeItem('bfit_token')
    localStorage.removeItem('bfit_user')
    localStorage.removeItem('foodfit_token')
    localStorage.removeItem('foodfit_user')
    setToken('')
    setUser(null)
  }, [])

  const updateUser = useCallback((nextUser) => {
    localStorage.setItem('contextfit_user', JSON.stringify(nextUser))
    localStorage.setItem('bfit_user', JSON.stringify(nextUser))
    localStorage.setItem('foodfit_user', JSON.stringify(nextUser))
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
