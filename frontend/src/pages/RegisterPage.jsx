import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FieldInput from '../components/FieldInput'
import ErrorAlert from '../components/ErrorAlert'
import { normalizeApiError } from '../services/api/client'
import { registerUser, verifyEmail } from '../services/api/authApi'
import { isEmail } from '../utils/validators'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  promotionOptIn: false,
}

export default function RegisterPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [verificationToken, setVerificationToken] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!form.firstName || !form.lastName || !isEmail(form.email) || form.password.length < 8) {
      setError('Complete all required fields. Password must be at least 8 characters.')
      return
    }

    try {
      const data = await registerUser(form)
      setMessage('Registration complete. Account is INACTIVE until email verification succeeds.')
      if (data.verificationToken) {
        setVerificationToken(data.verificationToken)
      }
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleVerify = async () => {
    setError('')
    setMessage('')

    if (!isEmail(form.email) || !verificationToken) {
      setError('Email and verification token are required.')
      return
    }

    try {
      await verifyEmail({ email: form.email, token: verificationToken })
      setMessage('Email verified. You can login now.')
      setTimeout(() => navigate('/login'), 600)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>Join ContextFit</h1>
        <p className="muted">
          Create your account to unlock personalized nutrition intelligence, meal planning, and activity tracking.
        </p>

        <ErrorAlert message={error} />
        {message ? <p className="status-message">{message}</p> : null}

        <form className="form" onSubmit={handleSubmit}>
          <div className="split-two">
            <FieldInput
              label="First Name"
              required
              type="text"
              value={form.firstName}
              onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
            />

            <FieldInput
              label="Last Name"
              required
              type="text"
              value={form.lastName}
              onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
            />
          </div>

          <FieldInput
            label="Email"
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />

          <FieldInput
            label="Password"
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.promotionOptIn}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  promotionOptIn: event.target.checked,
                }))
              }
            />
            <span>Opt in for promotional offers</span>
          </label>

          <button className="button" type="submit">
            Register
          </button>
        </form>

        <div className="verify-row">
          <FieldInput
            label="Verification Token"
            type="text"
            placeholder="Paste verification token"
            value={verificationToken}
            onChange={(event) => setVerificationToken(event.target.value)}
          />

          <button className="button button-secondary" type="button" onClick={handleVerify}>
            Verify Email
          </button>
        </div>

        <p className="muted">
          Already registered? <Link to="/login">Login here</Link>
        </p>
      </article>

      <article className="panel">
        <h2>What Happens Next</h2>
        <ul className="summary-list">
          <li>Your account is created as INACTIVE until verification succeeds.</li>
          <li>Use the verification token to activate and enable secure login.</li>
          <li>After login, configure profile goals to improve recommendation quality.</li>
        </ul>
      </article>
    </section>
  )
}
