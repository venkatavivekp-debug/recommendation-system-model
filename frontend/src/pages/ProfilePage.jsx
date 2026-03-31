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
  updatePaymentCard,
  updateProfile,
} from '../services/api/profileApi'

const initialCardForm = {
  cardNumber: '',
  expiry: '',
  cardHolderName: '',
}

const initialPasswordForm = {
  currentPassword: '',
  newPassword: '',
}

function csvToArray(text) {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function ProfilePage() {
  const { updateUser } = useAuth()

  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const [cardForm, setCardForm] = useState(initialCardForm)
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm)
  const [editingCardId, setEditingCardId] = useState('')
  const [editingCard, setEditingCard] = useState({
    cardNumber: '',
    expiry: '',
    cardHolderName: '',
  })

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
    setIsSavingProfile(true)

    try {
      const safeDailyGoal = Number(profile.preferences?.dailyCalorieGoal)

      const data = await updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        address: profile.address || '',
        promotionOptIn: profile.promotionOptIn,
        favorites: profile.favorites || [],
        favoriteRestaurants: profile.favoriteRestaurants || [],
        favoriteFoods: profile.favoriteFoods || [],
        dailyCalorieGoal:
          Number.isFinite(safeDailyGoal) && safeDailyGoal > 0 ? safeDailyGoal : 2200,
        preferredDiet: profile.preferences?.preferredDiet,
        macroPreference: profile.preferences?.macroPreference,
        preferredCuisine: profile.preferences?.preferredCuisine,
        fitnessGoal: profile.preferences?.fitnessGoal,
      })

      setProfile(data.profile)
      updateUser(data.profile)
      setSuccess('Profile and preferences updated successfully.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSavingProfile(false)
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
      if (editingCardId === cardId) {
        setEditingCardId('')
      }
      setSuccess('Payment card removed.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleStartCardEdit = (card) => {
    setEditingCardId(card.id)
    setEditingCard({
      cardNumber: '',
      expiry: card.expiry,
      cardHolderName: card.cardHolderName,
    })
    setError('')
    setSuccess('')
  }

  const handleCancelCardEdit = () => {
    setEditingCardId('')
    setEditingCard({
      cardNumber: '',
      expiry: '',
      cardHolderName: '',
    })
  }

  const handleUpdateCard = async () => {
    setError('')
    setSuccess('')

    if (!editingCardId) {
      return
    }

    const payload = {}
    if (editingCard.cardNumber.trim()) {
      payload.cardNumber = editingCard.cardNumber.trim()
    }
    if (editingCard.expiry.trim()) {
      payload.expiry = editingCard.expiry.trim()
    }
    if (editingCard.cardHolderName.trim()) {
      payload.cardHolderName = editingCard.cardHolderName.trim()
    }

    try {
      const data = await updatePaymentCard(editingCardId, payload)
      setProfile(data.profile)
      setEditingCardId('')
      setSuccess('Payment card updated.')
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
      setPasswordForm(initialPasswordForm)
      setSuccess('Password updated.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  if (!profile) {
    return <section className="panel">Loading profile...</section>
  }

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>Profile Management</h1>
        <p className="muted">
          Update personal details, goals, and preferences. Email remains read-only by policy.
        </p>

        <ErrorAlert message={error} />
        {success ? <p className="status-message">{success}</p> : null}

        <div className="split-two">
          <article className="sub-panel">
            <h2>Basic Info</h2>
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

              <FieldInput label="Email (not editable)" type="email" value={profile.email} disabled />

              <FieldInput
                label="Address"
                required
                type="text"
                value={profile.address || ''}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    address: event.target.value,
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
            </div>
          </article>

          <article className="sub-panel">
            <h2>Nutrition + Fitness Goals</h2>
            <div className="form">
              <FieldInput
                label="Daily Calorie Goal"
                type="number"
                min="1200"
                max="5000"
                value={profile.preferences?.dailyCalorieGoal || ''}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    preferences: {
                      ...prev.preferences,
                      dailyCalorieGoal: Number(event.target.value || 0),
                    },
                  }))
                }
              />

              <div className="split-two">
                <FieldInput
                  label="Preferred Diet"
                  as="select"
                  value={profile.preferences?.preferredDiet || 'balanced'}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      preferences: {
                        ...prev.preferences,
                        preferredDiet: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="balanced">Balanced</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="high-protein">High Protein</option>
                  <option value="high-carb">High Carb</option>
                  <option value="low-calorie">Low Calorie</option>
                </FieldInput>

                <FieldInput
                  label="Macro Preference"
                  as="select"
                  value={profile.preferences?.macroPreference || 'balanced'}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      preferences: {
                        ...prev.preferences,
                        macroPreference: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="balanced">Balanced</option>
                  <option value="protein">Protein</option>
                  <option value="carb">Carb</option>
                </FieldInput>
              </div>

              <FieldInput
                label="Preferred Cuisine"
                type="text"
                placeholder="mediterranean, italian, mexican"
                value={profile.preferences?.preferredCuisine || ''}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    preferences: {
                      ...prev.preferences,
                      preferredCuisine: event.target.value,
                    },
                  }))
                }
              />

              <FieldInput
                label="Fitness Goal"
                as="select"
                value={profile.preferences?.fitnessGoal || 'maintain'}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    preferences: {
                      ...prev.preferences,
                      fitnessGoal: event.target.value,
                    },
                  }))
                }
              >
                <option value="maintain">Maintain</option>
                <option value="weight-loss">Weight Loss</option>
                <option value="muscle-gain">Muscle Gain</option>
              </FieldInput>
            </div>
          </article>
        </div>

        <article className="sub-panel">
          <h2>Favorites and Personal Preferences</h2>
          <div className="split-three">
            <FieldInput
              label="General Favorites (comma separated)"
              type="text"
              value={(profile.favorites || []).join(', ')}
              onChange={(event) =>
                setProfile((prev) => ({
                  ...prev,
                  favorites: csvToArray(event.target.value),
                }))
              }
            />

            <FieldInput
              label="Favorite Restaurants"
              type="text"
              value={(profile.favoriteRestaurants || []).join(', ')}
              onChange={(event) =>
                setProfile((prev) => ({
                  ...prev,
                  favoriteRestaurants: csvToArray(event.target.value),
                }))
              }
            />

            <FieldInput
              label="Favorite Foods"
              type="text"
              value={(profile.favoriteFoods || []).join(', ')}
              onChange={(event) =>
                setProfile((prev) => ({
                  ...prev,
                  favoriteFoods: csvToArray(event.target.value),
                }))
              }
            />
          </div>

          <button className="button" type="button" onClick={handleProfileSave} disabled={isSavingProfile}>
            {isSavingProfile ? 'Saving profile...' : 'Save Profile + Preferences'}
          </button>
        </article>
      </article>

      <article className="panel">
        <h2>Payment Cards</h2>
        <p className="muted">Secure storage with encryption. Maximum of 3 cards allowed.</p>

        <ul className="card-list">
          {(profile.paymentCards || []).map((card) => (
            <li key={card.id} className="card-row">
              <div>
                <strong>{card.maskedCardNumber}</strong>
                <p>{card.cardHolderName}</p>
                <p>Expires {card.expiry}</p>
              </div>
              <div className="card-actions">
                <button className="button button-ghost" type="button" onClick={() => handleStartCardEdit(card)}>
                  Edit
                </button>
                <button className="button button-secondary" type="button" onClick={() => handleRemoveCard(card.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        {editingCardId ? (
          <div className="sub-panel">
            <h3>Edit Card</h3>
            <p className="muted">
              Card number is optional while editing. Leave empty to keep the existing number.
            </p>
            <div className="form">
              <FieldInput
                label="New Card Number (optional)"
                type="text"
                placeholder="4111111111111111"
                value={editingCard.cardNumber}
                onChange={(event) =>
                  setEditingCard((prev) => ({
                    ...prev,
                    cardNumber: event.target.value,
                  }))
                }
              />

              <div className="split-two">
                <FieldInput
                  label="Expiry (MM/YY)"
                  type="text"
                  value={editingCard.expiry}
                  onChange={(event) =>
                    setEditingCard((prev) => ({
                      ...prev,
                      expiry: event.target.value,
                    }))
                  }
                />

                <FieldInput
                  label="Card Holder Name"
                  type="text"
                  value={editingCard.cardHolderName}
                  onChange={(event) =>
                    setEditingCard((prev) => ({
                      ...prev,
                      cardHolderName: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="inline-actions">
                <button className="button" type="button" onClick={handleUpdateCard}>
                  Save Card Update
                </button>
                <button className="button button-ghost" type="button" onClick={handleCancelCardEdit}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="sub-panel">
          <h3>Add New Card</h3>
          <div className="form">
            <FieldInput
              label="Card Number"
              required
              type="text"
              placeholder="4111111111111111"
              value={cardForm.cardNumber}
              onChange={(event) =>
                setCardForm((prev) => ({
                  ...prev,
                  cardNumber: event.target.value,
                }))
              }
            />

            <div className="split-two">
              <FieldInput
                label="Expiry (MM/YY)"
                required
                type="text"
                placeholder="12/29"
                value={cardForm.expiry}
                onChange={(event) =>
                  setCardForm((prev) => ({
                    ...prev,
                    expiry: event.target.value,
                  }))
                }
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

            <button className="button" type="button" onClick={handleAddCard} disabled={cardLimitReached}>
              {cardLimitReached ? 'Card Limit Reached' : 'Add Card'}
            </button>
          </div>
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
