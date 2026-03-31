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
  const [token, setToken] = useState(
    () => localStorage.getItem('bfit_token') || localStorage.getItem('foodfit_token') || ''
  )
  const [user, setUser] = useState(
    () => parseStoredUser(localStorage.getItem('bfit_user') || localStorage.getItem('foodfit_user'))
  )

  const login = ({ token: nextToken, user: nextUser }) => {
    localStorage.setItem('bfit_token', nextToken)
    localStorage.setItem('bfit_user', JSON.stringify(nextUser))
    localStorage.setItem('foodfit_token', nextToken)
    localStorage.setItem('foodfit_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }

  const logout = () => {
    localStorage.removeItem('bfit_token')
    localStorage.removeItem('bfit_user')
    localStorage.removeItem('foodfit_token')
    localStorage.removeItem('foodfit_user')
    setToken('')
    setUser(null)
  }

  const updateUser = (nextUser) => {
    localStorage.setItem('bfit_user', JSON.stringify(nextUser))
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
