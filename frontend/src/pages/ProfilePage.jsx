import { useEffect, useMemo, useState } from 'react'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import useAuth from '../hooks/useAuth'
import { changePassword } from '../services/api/authApi'
import { normalizeApiError } from '../services/api/client'
import {
  addPaymentCard,
  fetchProfile,
  removePaymentCard,
  updateProfile,
} from '../services/api/profileApi'

const initialCardForm = {
  cardNumber: '',
  expiry: '',
  cardHolderName: '',
}

export default function ProfilePage() {
  const { updateUser } = useAuth()

  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [cardForm, setCardForm] = useState(initialCardForm)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' })

  const cardLimitReached = useMemo(() => (profile?.paymentCards?.length || 0) >= 3, [profile])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await fetchProfile()
        setProfile(data.profile)
        updateUser(data.profile)
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      }
    }

    loadProfile()
  }, [updateUser])

  const handleProfileSave = async () => {
    if (!profile) {
      return
    }

    setError('')
    setSuccess('')

    try {
      const data = await updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        address: profile.address || '',
        promotionOptIn: profile.promotionOptIn,
        favorites: profile.favorites,
      })

      setProfile(data.profile)
      updateUser(data.profile)
      setSuccess('Profile updated successfully.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleAddCard = async () => {
    setError('')
    setSuccess('')

    try {
      const data = await addPaymentCard(cardForm)
      setProfile(data.profile)
      setCardForm(initialCardForm)
      setSuccess('Payment card added.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleRemoveCard = async (cardId) => {
    setError('')
    setSuccess('')

    try {
      const data = await removePaymentCard(cardId)
      setProfile(data.profile)
      setSuccess('Payment card removed.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleChangePassword = async () => {
    setError('')
    setSuccess('')

    if (passwordForm.newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }

    try {
      await changePassword(passwordForm)
      setPasswordForm({ currentPassword: '', newPassword: '' })
      setSuccess('Password updated.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  if (!profile) {
    return <section className="panel">Loading profile...</section>
  }

  return (
    <section className="page-grid profile-grid">
      <article className="panel">
        <h1>Profile</h1>
        <p className="muted">Email is immutable and managed at account level.</p>

        <ErrorAlert message={error} />
        {success ? <p className="status-message">{success}</p> : null}

        <div className="form">
          <div className="split-two">
            <FieldInput
              label="First Name"
              required
              type="text"
              value={profile.firstName}
              onChange={(event) =>
                setProfile((prev) => ({
                  ...prev,
                  firstName: event.target.value,
                }))
              }
            />

            <FieldInput
              label="Last Name"
              required
              type="text"
              value={profile.lastName}
              onChange={(event) =>
                setProfile((prev) => ({
                  ...prev,
                  lastName: event.target.value,
                }))
              }
            />
          </div>

          <FieldInput label="Email" type="email" value={profile.email} disabled />

          <FieldInput
            label="Address"
            required
            type="text"
            value={profile.address || ''}
            onChange={(event) => setProfile((prev) => ({ ...prev, address: event.target.value }))}
          />

          <FieldInput
            label="Favorite Items (comma separated)"
            type="text"
            value={(profile.favorites || []).join(', ')}
            onChange={(event) =>
              setProfile((prev) => ({
                ...prev,
                favorites: event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              }))
            }
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={profile.promotionOptIn}
              onChange={(event) =>
                setProfile((prev) => ({
                  ...prev,
                  promotionOptIn: event.target.checked,
                }))
              }
            />
            <span>Promotional email opt-in</span>
          </label>

          <button className="button" type="button" onClick={handleProfileSave}>
            Save Profile
          </button>
        </div>
      </article>

      <article className="panel">
        <h2>Payment Cards</h2>
        <p className="muted">Maximum of 3 cards allowed.</p>

        <ul className="card-list">
          {(profile.paymentCards || []).map((card) => (
            <li key={card.id} className="card-row">
              <div>
                <strong>{card.maskedCardNumber}</strong>
                <p>{card.cardHolderName}</p>
                <p>Expires {card.expiry}</p>
              </div>
              <button
                className="button button-ghost"
                type="button"
                onClick={() => handleRemoveCard(card.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="form">
          <FieldInput
            label="Card Number"
            required
            type="text"
            placeholder="4111111111111111"
            value={cardForm.cardNumber}
            onChange={(event) => setCardForm((prev) => ({ ...prev, cardNumber: event.target.value }))}
          />

          <div className="split-two">
            <FieldInput
              label="Expiry (MM/YY)"
              required
              type="text"
              placeholder="12/29"
              value={cardForm.expiry}
              onChange={(event) => setCardForm((prev) => ({ ...prev, expiry: event.target.value }))}
            />

            <FieldInput
              label="Card Holder Name"
              required
              type="text"
              value={cardForm.cardHolderName}
              onChange={(event) =>
                setCardForm((prev) => ({
                  ...prev,
                  cardHolderName: event.target.value,
                }))
              }
            />
          </div>

          <button
            className="button"
            type="button"
            onClick={handleAddCard}
            disabled={cardLimitReached}
          >
            {cardLimitReached ? 'Card Limit Reached' : 'Add Card'}
          </button>
        </div>
      </article>

      <article className="panel">
        <h2>Change Password</h2>
        <div className="form">
          <FieldInput
            label="Current Password"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                currentPassword: event.target.value,
              }))
            }
          />

          <FieldInput
            label="New Password"
            type="password"
            value={passwordForm.newPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                newPassword: event.target.value,
              }))
            }
          />

          <button className="button button-secondary" type="button" onClick={handleChangePassword}>
            Change Password
          </button>
        </div>
      </article>
    </section>
  )
}
