import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FieldInput from '../components/FieldInput'
import ErrorAlert from '../components/ErrorAlert'
import useAuth from '../hooks/useAuth'
import {
  forgotPassword,
  loginUser,
  resetPassword,
} from '../services/api/authApi'
import { normalizeApiError } from '../services/api/client'
import { isEmail } from '../utils/validators'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const handleLogin = async (event) => {
    event.preventDefault()
    setError('')

    if (!isEmail(credentials.email) || credentials.password.length < 1) {
      setError('Enter a valid email and password.')
      return
    }

    try {
      setIsSubmitting(true)
      const data = await loginUser(credentials)
      login(data)
      navigate('/dashboard')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    setError('')
    setForgotMessage('')

    if (!isEmail(forgotEmail)) {
      setForgotMessage('Provide a valid email for reset.')
      return
    }

    try {
      const data = await forgotPassword({ email: forgotEmail })
      setForgotMessage('Reset email simulated. Use the token below in development.')
      if (data.resetToken) {
        setResetToken(data.resetToken)
      }
    } catch (apiError) {
      setForgotMessage(normalizeApiError(apiError))
    }
  }

  const handleResetPassword = async () => {
    setError('')

    if (!resetToken || newPassword.length < 8) {
      setForgotMessage('Reset token and new password (8+ chars) are required.')
      return
    }

    try {
      await resetPassword({ token: resetToken, newPassword })
      setForgotMessage('Password reset complete. Login with your new password.')
      setNewPassword('')
    } catch (apiError) {
      setForgotMessage(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>Welcome to ContextFit</h1>
        <p className="muted">A context-aware, adaptive, explainable lifestyle intelligence system.</p>

        <ErrorAlert message={error} />

        <form className="form" onSubmit={handleLogin}>
          <FieldInput
            label="Email"
            required
            type="email"
            placeholder="you@example.com"
            value={credentials.email}
            onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
          />

          <FieldInput
            label="Password"
            required
            type="password"
            placeholder="Enter password"
            value={credentials.password}
            onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
          />

          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="muted">
          New account? <Link to="/register">Register here</Link>
        </p>
      </article>

      <article className="panel">
        <h2>Forgot Password</h2>
        <p className="muted">Generate and apply a reset token (mock email flow).</p>

        <FieldInput
          label="Account Email"
          required
          type="email"
          value={forgotEmail}
          onChange={(event) => setForgotEmail(event.target.value)}
        />

        <button className="button button-secondary" type="button" onClick={handleForgotPassword}>
          Send Reset Token
        </button>

        <FieldInput
          label="Reset Token"
          type="text"
          value={resetToken}
          onChange={(event) => setResetToken(event.target.value)}
        />

        <FieldInput
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />

        <button className="button" type="button" onClick={handleResetPassword}>
          Reset Password
        </button>

        {forgotMessage ? <p className="muted">{forgotMessage}</p> : null}
      </article>

      <article className="panel">
        <h2>Demo-Friendly Notes</h2>
        <ul className="summary-list">
          <li>Newly registered accounts can login immediately.</li>
          <li>Use forgot/reset flow to test token-based password recovery.</li>
          <li>Dashboard updates when you calculate routes from selected food results.</li>
        </ul>
      </article>
    </section>
  )
}
