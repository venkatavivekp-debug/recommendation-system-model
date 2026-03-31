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

export default function ProfilePage() {
  const { updateUser } = useAuth()

  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm)
  const [allergyInput, setAllergyInput] = useState('')

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await fetchProfile()
        setProfile({
          ...data.profile,
          preferences: data.profile?.preferences || {},
        })
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
        const preferences = profile.preferences || {}
        const data = await updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        address: profile.address || '',
        promotionOptIn: profile.promotionOptIn,
        favorites: profile.favorites || [],
        favoriteRestaurants: profile.favoriteRestaurants || [],
        favoriteFoods: profile.favoriteFoods || [],
          dailyCalories: Number(preferences.dailyCalorieGoal || 2200),
          proteinTarget: Number(preferences.proteinGoal || 140),
          carbTarget: Number(preferences.carbsGoal || 220),
          fatTarget: Number(preferences.fatsGoal || 70),
          fiberTarget: Number(preferences.fiberGoal || 30),
          preferredDiet: preferences.preferredDiet || 'non-veg',
          preferredCuisine: preferences.preferredCuisine || '',
          macroPreference: preferences.macroPreference || 'balanced',
        fitnessGoal: preferences.fitnessGoal || 'maintain',
        allergies: profile.allergies || [],
      })

      setProfile(data.profile)
      updateUser(data.profile)
      setSuccess('Profile and nutrition goals updated.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
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

    setProfile((prev) => {
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
    setProfile((prev) => ({
      ...prev,
      allergies: (prev.allergies || []).filter((item) => normalizeAllergyText(item) !== normalized),
    }))
  }

  if (!profile) {
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
            <h2>Nutrition Goals + Preferences</h2>
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
                  label="Protein Goal (g)"
                  type="number"
                  min="30"
                  max="320"
                  value={profile.preferences?.proteinGoal || ''}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      preferences: {
                        ...prev.preferences,
                        proteinGoal: Number(event.target.value || 0),
                      },
                    }))
                  }
                />
                <FieldInput
                  label="Carbs Goal (g)"
                  type="number"
                  min="30"
                  max="600"
                  value={profile.preferences?.carbsGoal || ''}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      preferences: {
                        ...prev.preferences,
                        carbsGoal: Number(event.target.value || 0),
                      },
                    }))
                  }
                />
              </div>

              <div className="split-two">
                <FieldInput
                  label="Fats Goal (g)"
                  type="number"
                  min="20"
                  max="220"
                  value={profile.preferences?.fatsGoal || ''}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      preferences: {
                        ...prev.preferences,
                        fatsGoal: Number(event.target.value || 0),
                      },
                    }))
                  }
                />
                <FieldInput
                  label="Fiber Goal (g)"
                  type="number"
                  min="10"
                  max="90"
                  value={profile.preferences?.fiberGoal || ''}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      preferences: {
                        ...prev.preferences,
                        fiberGoal: Number(event.target.value || 0),
                      },
                    }))
                  }
                />
              </div>

              <FieldInput
                label="Preferred Diet"
                as="select"
                value={profile.preferences?.preferredDiet || 'non-veg'}
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
                <option value="veg">Vegetarian</option>
                <option value="non-veg">Non-Vegetarian</option>
                <option value="vegan">Vegan</option>
              </FieldInput>

              <div className="split-two">
                <FieldInput
                  label="Preferred Cuisine"
                  type="text"
                  placeholder="italian, mexican, mediterranean"
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
                  <option value="lose-weight">Lose Weight</option>
                  <option value="maintain">Maintain</option>
                  <option value="gain-muscle">Gain Muscle</option>
                </FieldInput>
              </div>

              <FieldInput
                label="Macro Preference for Ranking"
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

              <div className="field">
                <span className="field-label">Allergies</span>
                <div className="chip-row">
                  {(profile.allergies || []).map((allergy) => (
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

              <FieldInput
                label="Allergies (comma-separated backup)"
                type="text"
                placeholder="peanuts, dairy, gluten"
                value={(profile.allergies || []).join(', ')}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    allergies: csvToArray(event.target.value).map(normalizeAllergyText),
                  }))
                }
              />
            </div>
          </article>
        </div>

        <article className="sub-panel">
          <h2>Favorites</h2>
          <div className="split-three">
            <FieldInput
              label="General Favorites"
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
