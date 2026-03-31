import { createContext, useMemo, useState } from 'react'

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
  const [token, setToken] = useState(() => localStorage.getItem('foodfit_token') || '')
  const [user, setUser] = useState(() => parseStoredUser(localStorage.getItem('foodfit_user')))

  const login = ({ token: nextToken, user: nextUser }) => {
    localStorage.setItem('foodfit_token', nextToken)
    localStorage.setItem('foodfit_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }

  const logout = () => {
    localStorage.removeItem('foodfit_token')
    localStorage.removeItem('foodfit_user')
    setToken('')
    setUser(null)
  }

  const updateUser = (nextUser) => {
    localStorage.setItem('foodfit_user', JSON.stringify(nextUser))
    setUser(nextUser)
  }

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      logout,
      updateUser,
    }),
    [token, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
