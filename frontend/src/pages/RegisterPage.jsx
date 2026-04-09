import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FieldInput from '../components/FieldInput'
import ErrorAlert from '../components/ErrorAlert'
import { registerUser } from '../services/api/authApi'
import { isEmail } from '../utils/validators'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
}

export default function RegisterPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!form.firstName || !form.lastName || !isEmail(form.email) || form.password.length < 8) {
      setError('Complete all required fields. Password must be at least 8 characters.')
      return
    }

    try {
      setIsSubmitting(true)
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      }
      const data = await registerUser(payload)
      setMessage(data?.message || 'Account created successfully')
      setTimeout(() => navigate('/login'), 800)
    } catch (apiError) {
      if (apiError?.response?.data?.error) {
        const backendError =
          typeof apiError.response.data.error === 'string'
            ? apiError.response.data.error
            : apiError.response.data.error.message
        setError(backendError || 'Something went wrong')
      } else {
        setError('Server unavailable')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>Join recommendation-system-model</h1>
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

          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Registering...' : 'Register'}
          </button>
        </form>

        <p className="muted">
          Already registered? <Link to="/login">Login here</Link>
        </p>
      </article>

      <article className="panel">
        <h2>What Happens Next</h2>
        <ul className="summary-list">
          <li>Your account is created immediately when registration succeeds.</li>
          <li>You are redirected to login automatically.</li>
          <li>After login, configure profile goals to improve recommendation quality.</li>
        </ul>
      </article>
    </section>
  )
}
