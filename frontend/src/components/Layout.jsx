import { NavLink, useNavigate } from 'react-router-dom'
import { logoutUser } from '../services/api/authApi'
import useAuth from '../hooks/useAuth'

const privateLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/exercise', label: 'Exercise' },
  { to: '/search', label: 'Search' },
  { to: '/results', label: 'Results' },
  { to: '/route-summary', label: 'Route Summary' },
  { to: '/community', label: 'Community Recipes' },
  { to: '/history', label: 'History' },
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
        <div className="brand-block">
          <p className="brand-kicker">recommendation-system-model</p>
          <p className="brand-title">recommendation-system-model</p>
          <p className="brand-subtitle">
            Adaptive cross-domain recommendation engine
          </p>
        </div>

        <nav className="top-links" aria-label="Main navigation">
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
              <span className="user-badge">
                {user?.firstName || 'Member'} {user?.lastName?.[0] || ''}
              </span>
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
