import { NavLink, useNavigate } from 'react-router-dom'
import { logoutUser } from '../services/api/authApi'
import useAuth from '../hooks/useAuth'

const privateLinks = [
  { to: '/search', label: 'Search' },
  { to: '/results', label: 'Results' },
  { to: '/route-summary', label: 'Route' },
  { to: '/profile', label: 'Profile' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const { isAuthenticated, logout, user } = useAuth()

  const handleLogout = async () => {
    try {
      await logoutUser()
    } catch {
      // Token may already be expired; frontend still clears session.
    }

    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div>
          <p className="brand-title">Food + Fitness Navigator</p>
          <p className="brand-subtitle">Calories In vs Calories Out</p>
        </div>

        <nav className="top-links">
          {isAuthenticated
            ? privateLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `top-link ${isActive ? 'top-link-active' : ''}`}
                >
                  {link.label}
                </NavLink>
              ))
            : null}
        </nav>

        <div className="top-actions">
          {isAuthenticated ? (
            <>
              <span className="user-badge">{user?.firstName || 'Member'}</span>
              <button className="button button-secondary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="top-link">
                Login
              </NavLink>
              <NavLink to="/register" className="top-link">
                Register
              </NavLink>
            </>
          )}
        </div>
      </header>

      <main className="page-content">{children}</main>
    </div>
  )
}
