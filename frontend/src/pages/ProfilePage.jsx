import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import useAuth from '../hooks/useAuth'
import { changePassword } from '../services/api/authApi'
import { normalizeApiError } from '../services/api/client'
import { fetchProfile, updateProfile } from '../services/api/profileApi'

const initialPasswordForm = {
  currentPassword: '',
  newPassword: '',
}

const COMMON_ALLERGIES = ['peanuts', 'dairy', 'gluten', 'shellfish', 'soy']

function csvToArray(text) {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeAllergyText(value) {
  return String(value || '').trim().toLowerCase()
}

function mapProfileToForm(profile) {
  const preferences = profile?.preferences || {}

  return {
    firstName: profile?.firstName || '',
    lastName: profile?.lastName || '',
    email: profile?.email || '',
    address: profile?.address || '',
    promotionOptIn: Boolean(profile?.promotionOptIn),
    dailyCalories: String(preferences.dailyCalorieGoal ?? 2200),
    proteinTarget: String(preferences.proteinGoal ?? 140),
    carbTarget: String(preferences.carbsGoal ?? 220),
    fatTarget: String(preferences.fatsGoal ?? 70),
    fiberTarget: String(preferences.fiberGoal ?? 30),
    preferredDiet: preferences.preferredDiet || 'non-veg',
    preferredCuisine: preferences.preferredCuisine || '',
    macroPreference: preferences.macroPreference || 'balanced',
    fitnessGoal: preferences.fitnessGoal || 'maintain',
    allergies: Array.isArray(profile?.allergies) ? profile.allergies : [],
    favoritesCsv: (profile?.favorites || []).join(', '),
    favoriteRestaurantsCsv: (profile?.favoriteRestaurants || []).join(', '),
    favoriteFoodsCsv: (profile?.favoriteFoods || []).join(', '),
  }
}

function parseNumberField(value, fieldLabel) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} must be a valid number.`)
  }

  return parsed
}

export default function ProfilePage() {
  const { updateUser } = useAuth()

  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [toast, setToast] = useState(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm)
  const [allergyInput, setAllergyInput] = useState('')

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await fetchProfile()
        setForm(mapProfileToForm(data.profile))
        updateUser(data.profile)
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      }
    }

    loadProfile()
  }, [updateUser])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  const handleFieldChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }
    })
  }

  const handleProfileSave = async () => {
    if (!form) {
      return
    }

    setError('')
    setSuccess('')
    setIsSavingProfile(true)

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        address: form.address.trim(),
        promotionOptIn: Boolean(form.promotionOptIn),
        favorites: csvToArray(form.favoritesCsv),
        favoriteRestaurants: csvToArray(form.favoriteRestaurantsCsv),
        favoriteFoods: csvToArray(form.favoriteFoodsCsv),
        dailyCalories: parseNumberField(form.dailyCalories, 'Daily calorie goal'),
        proteinTarget: parseNumberField(form.proteinTarget, 'Protein target'),
        carbTarget: parseNumberField(form.carbTarget, 'Carb target'),
        fatTarget: parseNumberField(form.fatTarget, 'Fat target'),
        fiberTarget: parseNumberField(form.fiberTarget, 'Fiber target'),
        preferredDiet: form.preferredDiet,
        preferredCuisine: form.preferredCuisine.trim(),
        macroPreference: form.macroPreference,
        fitnessGoal: form.fitnessGoal,
        allergies: (form.allergies || []).map(normalizeAllergyText).filter(Boolean),
      }

      const data = await updateProfile(payload)
      updateUser(data.profile)
      setForm(mapProfileToForm(data.profile))
      setSuccess('Profile and nutrition goals updated.')
      setToast({ type: 'success', message: 'Profile saved successfully.' })
    } catch (apiError) {
      const message = normalizeApiError(apiError)
      setError(message)
      setToast({ type: 'error', message })
    } finally {
      setIsSavingProfile(false)
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

  const addAllergyTag = (value) => {
    const normalized = normalizeAllergyText(value)
    if (!normalized) {
      return
    }

    setForm((prev) => {
      if (!prev) {
        return prev
      }
      const next = new Set((prev.allergies || []).map(normalizeAllergyText))
      next.add(normalized)
      return {
        ...prev,
        allergies: Array.from(next),
      }
    })
    setAllergyInput('')
  }

  const removeAllergyTag = (value) => {
    const normalized = normalizeAllergyText(value)
    setForm((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        allergies: (prev.allergies || []).filter((item) => normalizeAllergyText(item) !== normalized),
      }
    })
  }

  if (!form) {
    return <section className="panel">Loading profile...</section>
  }

  return (
    <section className="page-grid single">
      <article className="panel">
        <div className="panel-hero-top">
          <div>
            <h1>BFIT Profile</h1>
            <p className="muted">
              Set your daily macro targets to power intelligent food and grocery recommendations.
            </p>
          </div>
          <Link className="button button-ghost" to="/friends">
            Add Friend
          </Link>
        </div>
        <p className="muted">
          Profile updates are editable anytime and synced to recommendation + planner logic.
        </p>

        <ErrorAlert message={error} />
        {success ? <p className="status-message">{success}</p> : null}
        {toast ? (
          <p className={toast.type === 'error' ? 'toast-message toast-error' : 'toast-message'}>
            {toast.message}
          </p>
        ) : null}

        <div className="split-two">
          <article className="sub-panel">
            <h2>Basic Info</h2>
            <div className="form">
              <div className="split-two">
                <FieldInput
                  label="First Name"
                  required
                  name="firstName"
                  type="text"
                  value={form.firstName}
                  onChange={handleFieldChange}
                />

                <FieldInput
                  label="Last Name"
                  required
                  name="lastName"
                  type="text"
                  value={form.lastName}
                  onChange={handleFieldChange}
                />
              </div>

              <FieldInput label="Email (not editable)" name="email" type="email" value={form.email} disabled />

              <FieldInput
                label="Address"
                required
                name="address"
                type="text"
                value={form.address}
                onChange={handleFieldChange}
              />

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="promotionOptIn"
                  checked={Boolean(form.promotionOptIn)}
                  onChange={handleFieldChange}
                />
                <span>Promotional email opt-in</span>
              </label>
            </div>
          </article>

          <article className="sub-panel">
            <h2>Nutrition Goals + Preferences</h2>
            <div className="form">
              <FieldInput
                label="Daily Calorie Goal"
                name="dailyCalories"
                type="number"
                value={form.dailyCalories}
                onChange={handleFieldChange}
              />

              <div className="split-two">
                <FieldInput
                  label="Protein Goal (g)"
                  name="proteinTarget"
                  type="number"
                  value={form.proteinTarget}
                  onChange={handleFieldChange}
                />
                <FieldInput
                  label="Carbs Goal (g)"
                  name="carbTarget"
                  type="number"
                  value={form.carbTarget}
                  onChange={handleFieldChange}
                />
              </div>

              <div className="split-two">
                <FieldInput
                  label="Fats Goal (g)"
                  name="fatTarget"
                  type="number"
                  value={form.fatTarget}
                  onChange={handleFieldChange}
                />
                <FieldInput
                  label="Fiber Goal (g)"
                  name="fiberTarget"
                  type="number"
                  value={form.fiberTarget}
                  onChange={handleFieldChange}
                />
              </div>

              <FieldInput
                label="Preferred Diet"
                as="select"
                name="preferredDiet"
                value={form.preferredDiet}
                onChange={handleFieldChange}
              >
                <option value="veg">Vegetarian</option>
                <option value="non-veg">Non-Vegetarian</option>
                <option value="vegan">Vegan</option>
              </FieldInput>

              <div className="split-two">
                <FieldInput
                  label="Preferred Cuisine"
                  name="preferredCuisine"
                  type="text"
                  placeholder="italian, mexican, mediterranean"
                  value={form.preferredCuisine}
                  onChange={handleFieldChange}
                />

                <FieldInput
                  label="Fitness Goal"
                  as="select"
                  name="fitnessGoal"
                  value={form.fitnessGoal}
                  onChange={handleFieldChange}
                >
                  <option value="lose-weight">Lose Weight</option>
                  <option value="maintain">Maintain</option>
                  <option value="gain-muscle">Gain Muscle</option>
                </FieldInput>
              </div>

              <FieldInput
                label="Macro Preference for Ranking"
                as="select"
                name="macroPreference"
                value={form.macroPreference}
                onChange={handleFieldChange}
              >
                <option value="balanced">Balanced</option>
                <option value="protein">Protein</option>
                <option value="carb">Carb</option>
              </FieldInput>

              <div className="field">
                <span className="field-label">Allergies</span>
                <div className="chip-row">
                  {(form.allergies || []).map((allergy) => (
                    <span key={allergy} className="chip allergy-chip">
                      {allergy}
                      <button
                        className="chip-close"
                        type="button"
                        onClick={() => removeAllergyTag(allergy)}
                        aria-label={`Remove ${allergy}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="inline-actions">
                  <input
                    className="field-control"
                    type="text"
                    placeholder="Add allergy (e.g., peanuts)"
                    value={allergyInput}
                    onChange={(event) => setAllergyInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault()
                        addAllergyTag(allergyInput)
                      }
                    }}
                  />
                  <button className="button button-ghost" type="button" onClick={() => addAllergyTag(allergyInput)}>
                    Add
                  </button>
                </div>
                <div className="chip-row">
                  {COMMON_ALLERGIES.map((allergy) => (
                    <button
                      key={allergy}
                      className="chip chip-button"
                      type="button"
                      onClick={() => addAllergyTag(allergy)}
                    >
                      + {allergy}
                    </button>
                  ))}
                </div>
                <p className="muted">Allergies are normalized to lowercase and applied across all food flows.</p>
              </div>
            </div>
          </article>
        </div>

        <article className="sub-panel">
          <h2>Favorites</h2>
          <div className="split-three">
            <FieldInput
              label="General Favorites"
              name="favoritesCsv"
              type="text"
              value={form.favoritesCsv}
              onChange={handleFieldChange}
            />

            <FieldInput
              label="Favorite Restaurants"
              name="favoriteRestaurantsCsv"
              type="text"
              value={form.favoriteRestaurantsCsv}
              onChange={handleFieldChange}
            />

            <FieldInput
              label="Favorite Foods"
              name="favoriteFoodsCsv"
              type="text"
              value={form.favoriteFoodsCsv}
              onChange={handleFieldChange}
            />
          </div>

          <button className="button" type="button" onClick={handleProfileSave} disabled={isSavingProfile}>
            {isSavingProfile ? 'Saving profile...' : 'Save Profile + Goals'}
          </button>
        </article>
      </article>

      <article className="panel">
        <h2>Security</h2>
        <p className="muted">Update your password anytime for account safety.</p>
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
