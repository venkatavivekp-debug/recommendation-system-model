import { useEffect, useState } from 'react'
import BackButton from '../components/BackButton'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import useAuth from '../hooks/useAuth'
import { normalizeApiError } from '../services/api/client'
import { fetchProfile, updateProfile } from '../services/api/profileApi'

const COMMON_ALLERGIES = ['peanuts', 'dairy', 'gluten', 'shellfish', 'soy']

const EMPTY_FORM = {
  email: '',
  address: '',
  dailyCalories: '2200',
  proteinTarget: '140',
  carbTarget: '220',
  fatTarget: '70',
  fiberTarget: '30',
  preferredDiet: 'non-veg',
  preferredCuisine: '',
  fitnessGoal: 'maintain',
  macroPreference: 'balanced',
  allergies: [],
  movieGenres: '',
  movieMoods: '',
  dislikedGenres: '',
  preferredLanguages: 'english',
  typicalWatchTime: '45',
  musicGenres: '',
  musicMoods: '',
  workoutMusicPreference: 'high-energy',
  walkingMusicPreference: 'chill',
}

function normalizeAllergy(value) {
  return String(value || '').trim().toLowerCase()
}

function mapProfileToForm(profile) {
  const preferences = profile?.preferences || {}
  const contentPreferences = profile?.contentPreferences || {}
  const joinList = (list) => (Array.isArray(list) ? list.join(', ') : '')

  return {
    email: profile?.email || '',
    address: profile?.address || '',
    dailyCalories: String(preferences.dailyCalorieGoal ?? 2200),
    proteinTarget: String(preferences.proteinGoal ?? 140),
    carbTarget: String(preferences.carbsGoal ?? 220),
    fatTarget: String(preferences.fatsGoal ?? 70),
    fiberTarget: String(preferences.fiberGoal ?? 30),
    preferredDiet: preferences.preferredDiet || 'non-veg',
    preferredCuisine: preferences.preferredCuisine || '',
    fitnessGoal: preferences.fitnessGoal || 'maintain',
    macroPreference: preferences.macroPreference || 'balanced',
    allergies: Array.isArray(profile?.allergies)
      ? Array.from(new Set(profile.allergies.map(normalizeAllergy).filter(Boolean)))
      : [],
    movieGenres: joinList(contentPreferences.favoriteGenres),
    movieMoods: joinList(contentPreferences.preferredMoods),
    dislikedGenres: joinList(contentPreferences.dislikedGenres),
    preferredLanguages: joinList(contentPreferences.preferredLanguages) || 'english',
    typicalWatchTime: String(contentPreferences.typicalWatchTime ?? 45),
    musicGenres: joinList(contentPreferences.musicGenres),
    musicMoods: joinList(contentPreferences.musicMoods),
    workoutMusicPreference: contentPreferences.workoutMusicPreference || 'high-energy',
    walkingMusicPreference: contentPreferences.walkingMusicPreference || 'chill',
  }
}

function parseCommaList(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function parseNumber(value, fieldLabel) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} must be a valid number.`)
  }
  if (parsed < 0) {
    throw new Error(`${fieldLabel} cannot be negative.`)
  }

  return parsed
}

export default function ProfilePage() {
  const { updateUser } = useAuth()

  const [form, setForm] = useState(EMPTY_FORM)
  const [allergyInput, setAllergyInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true)
        const data = await fetchProfile()
        setForm(mapProfileToForm(data.profile))
        updateUser(data.profile)
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [updateUser])

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const addAllergy = (value) => {
    const normalized = normalizeAllergy(value)
    if (!normalized) {
      return
    }

    setForm((prev) => ({
      ...prev,
      allergies: Array.from(new Set([...(prev.allergies || []), normalized])),
    }))
    setAllergyInput('')
  }

  const removeAllergy = (value) => {
    const normalized = normalizeAllergy(value)
    setForm((prev) => ({
      ...prev,
      allergies: (prev.allergies || []).filter((item) => normalizeAllergy(item) !== normalized),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    try {
      setIsSaving(true)
      const payload = {
        address: form.address.trim(),
        dailyCalories: parseNumber(form.dailyCalories, 'Daily calories'),
        proteinTarget: parseNumber(form.proteinTarget, 'Protein target'),
        carbTarget: parseNumber(form.carbTarget, 'Carb target'),
        fatTarget: parseNumber(form.fatTarget, 'Fat target'),
        fiberTarget: parseNumber(form.fiberTarget, 'Fiber target'),
        preferredDiet: form.preferredDiet,
        preferredCuisine: form.preferredCuisine.trim(),
        fitnessGoal: form.fitnessGoal,
        macroPreference: form.macroPreference,
        allergies: (form.allergies || []).map(normalizeAllergy).filter(Boolean),
        favoriteGenres: parseCommaList(form.movieGenres),
        preferredMoods: parseCommaList(form.movieMoods),
        dislikedGenres: parseCommaList(form.dislikedGenres),
        preferredLanguages: parseCommaList(form.preferredLanguages),
        typicalWatchTime: parseNumber(form.typicalWatchTime, 'Typical watch duration'),
        musicGenres: parseCommaList(form.musicGenres),
        musicMoods: parseCommaList(form.musicMoods),
        workoutMusicPreference: form.workoutMusicPreference.trim().toLowerCase(),
        walkingMusicPreference: form.walkingMusicPreference.trim().toLowerCase(),
      }

      const data = await updateProfile(payload)
      setForm(mapProfileToForm(data.profile))
      updateUser(data.profile)
      setSuccess('Profile updated successfully.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSaving(false)
    }
  }

  const allergyChips = form.allergies || []

  if (isLoading) {
    return <section className="panel">Loading profile...</section>
  }

  return (
    <section className="page-grid single">
      <article className="panel">
        <BackButton />
        <div className="panel-hero-top">
          <div>
            <h1>recommendation-system-model Profile</h1>
            <p className="muted">Update nutrition goals and preferences used by your daily recommendation-system-model recommendations.</p>
          </div>
        </div>

        <ErrorAlert message={error} />
        {success ? <p className="status-message">{success}</p> : null}

        <form className="form" onSubmit={handleSubmit}>
          <div className="split-two">
            <article className="sub-panel">
              <h2>Nutrition Goals</h2>
              <FieldInput
                label="Daily Calories"
                name="dailyCalories"
                type="number"
                min="0"
                value={form.dailyCalories}
                onChange={handleFieldChange}
                required
              />

              <div className="split-two">
                <FieldInput
                  label="Protein Target (g)"
                  name="proteinTarget"
                  type="number"
                  min="0"
                  value={form.proteinTarget}
                  onChange={handleFieldChange}
                  required
                />
                <FieldInput
                  label="Carb Target (g)"
                  name="carbTarget"
                  type="number"
                  min="0"
                  value={form.carbTarget}
                  onChange={handleFieldChange}
                  required
                />
              </div>

              <div className="split-two">
                <FieldInput
                  label="Fat Target (g)"
                  name="fatTarget"
                  type="number"
                  min="0"
                  value={form.fatTarget}
                  onChange={handleFieldChange}
                  required
                />
                <FieldInput
                  label="Fiber Target (g)"
                  name="fiberTarget"
                  type="number"
                  min="0"
                  value={form.fiberTarget}
                  onChange={handleFieldChange}
                  required
                />
              </div>
            </article>

            <article className="sub-panel">
              <h2>Preferences</h2>

              <FieldInput
                label="Email (not editable)"
                name="email"
                type="email"
                value={form.email}
                disabled
              />

              <FieldInput
                label="Address"
                name="address"
                type="text"
                value={form.address}
                onChange={handleFieldChange}
                placeholder="Street, city"
              />

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
                  value={form.preferredCuisine}
                  onChange={handleFieldChange}
                  placeholder="Mediterranean, Mexican, ..."
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
                label="Macro Preference"
                as="select"
                name="macroPreference"
                value={form.macroPreference}
                onChange={handleFieldChange}
              >
                <option value="balanced">Balanced</option>
                <option value="protein">High Protein</option>
                <option value="carb">Higher Carb</option>
              </FieldInput>

              <div className="field">
                <span className="field-label">Allergies</span>
                <div className="chip-row">
                  {allergyChips.map((allergy) => (
                    <span key={allergy} className="chip allergy-chip">
                      {allergy}
                      <button
                        className="chip-close"
                        type="button"
                        aria-label={`Remove ${allergy}`}
                        onClick={() => removeAllergy(allergy)}
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
                    value={allergyInput}
                    placeholder="Add allergy (e.g., peanuts)"
                    onChange={(event) => setAllergyInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault()
                        addAllergy(allergyInput)
                      }
                    }}
                  />
                  <button className="button button-ghost" type="button" onClick={() => addAllergy(allergyInput)}>
                    Add
                  </button>
                </div>

                <div className="chip-row">
                  {COMMON_ALLERGIES.map((allergy) => (
                    <button key={allergy} className="chip chip-button" type="button" onClick={() => addAllergy(allergy)}>
                      + {allergy}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          </div>

          <article className="sub-panel">
            <h2>Entertainment Preferences</h2>
            <p className="muted">
              Optional settings used for recommendation-system-model movie/show and music recommendations during meals, walking, and workouts.
            </p>
            <div className="split-two">
              <FieldInput
                label="Movie/Show Genres"
                name="movieGenres"
                type="text"
                value={form.movieGenres}
                onChange={handleFieldChange}
                placeholder="comedy, documentary, action"
              />
              <FieldInput
                label="Movie/Show Moods"
                name="movieMoods"
                type="text"
                value={form.movieMoods}
                onChange={handleFieldChange}
                placeholder="light, calm, uplifting"
              />
            </div>
            <div className="split-two">
              <FieldInput
                label="Disliked Genres"
                name="dislikedGenres"
                type="text"
                value={form.dislikedGenres}
                onChange={handleFieldChange}
                placeholder="horror, thriller"
              />
              <FieldInput
                label="Preferred Languages"
                name="preferredLanguages"
                type="text"
                value={form.preferredLanguages}
                onChange={handleFieldChange}
                placeholder="english, hindi, spanish"
              />
            </div>
            <div className="split-two">
              <FieldInput
                label="Typical Watch Duration (min)"
                name="typicalWatchTime"
                type="number"
                min="5"
                max="240"
                value={form.typicalWatchTime}
                onChange={handleFieldChange}
              />
              <FieldInput
                label="Music Genres"
                name="musicGenres"
                type="text"
                value={form.musicGenres}
                onChange={handleFieldChange}
                placeholder="pop, hip-hop, electronic"
              />
            </div>
            <div className="split-two">
              <FieldInput
                label="Music Moods"
                name="musicMoods"
                type="text"
                value={form.musicMoods}
                onChange={handleFieldChange}
                placeholder="energetic, chill"
              />
              <FieldInput
                label="Workout Music Preference"
                name="workoutMusicPreference"
                as="select"
                value={form.workoutMusicPreference}
                onChange={handleFieldChange}
              >
                <option value="high-energy">High Energy</option>
                <option value="intense">Intense</option>
                <option value="balanced">Balanced</option>
                <option value="chill">Chill</option>
              </FieldInput>
            </div>
            <FieldInput
              label="Walking Music Preference"
              name="walkingMusicPreference"
              as="select"
              value={form.walkingMusicPreference}
              onChange={handleFieldChange}
            >
              <option value="chill">Chill</option>
              <option value="uplifting">Uplifting</option>
              <option value="energetic">Energetic</option>
              <option value="podcast-friendly">Podcast Friendly</option>
            </FieldInput>
          </article>

          <button className="button" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving Profile...' : 'Save Profile'}
          </button>
        </form>
      </article>
    </section>
  )
}
