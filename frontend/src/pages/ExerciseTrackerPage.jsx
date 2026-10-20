import { useEffect, useState } from 'react'
import BackButton from '../components/BackButton'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import MetricCard from '../components/MetricCard'
import SongRecommendationCard from '../components/SongRecommendationCard'
import { normalizeApiError } from '../services/api/client'
import {
  buildSessionPreferencePayload,
  deleteExerciseSession,
  fetchExerciseHistory,
  fetchTodayExerciseSummary,
  logExerciseSteps,
  logExerciseWorkout,
  syncExerciseWearable,
  updateExerciseSession,
} from '../services/api/exerciseApi'
import { saveContentForLater, sendContentFeedback } from '../services/api/contentApi'

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

function SessionIntentFields({ values, onChange, idPrefix }) {
  return (
    <details className="session-intent">
      <summary>What do you feel like after this workout? <span className="muted">Optional</span></summary>
      <div className="split-two">
        <FieldInput label="Food preference / craving" type="text" list={`${idPrefix}-food`} placeholder="No preference" value={values.foodPreference} onChange={(event) => onChange((prev) => ({ ...prev, foodPreference: event.target.value }))} />
        <datalist id={`${idPrefix}-food`}>
          {['Chicken', 'Rice', 'Pasta', 'Vegetarian', 'Light meal'].map((item) => <option key={item} value={item} />)}
        </datalist>
        <FieldInput label="Music preference" type="text" list={`${idPrefix}-music`} placeholder="No preference" value={values.musicPreference} onChange={(event) => onChange((prev) => ({ ...prev, musicPreference: event.target.value }))} />
        <datalist id={`${idPrefix}-music`}>
          {['Rock', 'Hip-hop', 'Pop', 'Electronic', 'Smooth', 'Motivational'].map((item) => <option key={item} value={item} />)}
        </datalist>
      </div>
      <FieldInput label="Anything else for this session?" as="textarea" rows="2" maxLength="240" placeholder="For example: chicken and something with carbs." value={values.preferenceNote} onChange={(event) => onChange((prev) => ({ ...prev, preferenceNote: event.target.value }))} />
      <p className="helper-note">These choices shape this session only. Your saved taste changes when you give feedback.</p>
    </details>
  )
}

export default function ExerciseTrackerPage() {
  const [todayData, setTodayData] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [strengthForm, setStrengthForm] = useState({
    exerciseName: 'bench press',
    sets: '',
    reps: '',
    weightKg: '',
    bodyWeightKg: '70',
    intensity: 'moderate',
  })

  const [cardioForm, setCardioForm] = useState({
    activityType: 'running',
    durationMinutes: '',
    intensity: 'moderate',
    bodyWeightKg: '70',
  })

  const [stepsForm, setStepsForm] = useState({
    steps: '',
    durationMinutes: '',
    bodyWeightKg: '70',
    intensity: 'moderate',
  })

  const [wearableForm, setWearableForm] = useState({
    consentGiven: false,
    provider: 'apple-health',
    bodyWeightKg: '70',
    caloriesBurned: '',
    durationMinutes: '',
    steps: '',
  })

  const [saving, setSaving] = useState({
    strength: false,
    cardio: false,
    steps: false,
    wearable: false,
  })
  const [editingSession, setEditingSession] = useState(null)
  const [sessionIntent, setSessionIntent] = useState({ foodPreference: '', musicPreference: '', preferenceNote: '' })

  const loadData = async () => {
    try {
      setLoading(true)
      const [today, history] = await Promise.all([fetchTodayExerciseSummary(), fetchExerciseHistory(200)])
      setTodayData(today)
      setHistoryData(history)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const todaySummary = todayData?.summary
  const workoutMusicSuggestions = todayData?.contentSuggestions?.recommendations || []
  const todayKey = new Date().toISOString().slice(0, 10)

  const handleStrengthLog = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!strengthForm.exerciseName.trim()) {
      setError('Exercise name is required for strength logging.')
      return
    }

    try {
      setSaving((prev) => ({ ...prev, strength: true }))
      await logExerciseWorkout({
        workoutType: 'strength',
        ...buildSessionPreferencePayload(sessionIntent),
        bodyWeightKg: Number(strengthForm.bodyWeightKg || 70),
        intensity: strengthForm.intensity,
        exercises: [
          {
            name: strengthForm.exerciseName,
            sets: Number(strengthForm.sets || 0),
            reps: Number(strengthForm.reps || 0),
            weightKg: Number(strengthForm.weightKg || 0),
            intensity: strengthForm.intensity,
          },
        ],
      })

      setStatus('Strength workout logged.')
      setSessionIntent({ foodPreference: '', musicPreference: '', preferenceNote: '' })
      setStrengthForm((prev) => ({ ...prev, sets: '', reps: '', weightKg: '' }))
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setSaving((prev) => ({ ...prev, strength: false }))
    }
  }

  const handleCardioLog = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!cardioForm.durationMinutes) {
      setError('Duration is required for cardio logging.')
      return
    }

    try {
      setSaving((prev) => ({ ...prev, cardio: true }))
      await logExerciseWorkout({
        workoutType: cardioForm.activityType,
        ...buildSessionPreferencePayload(sessionIntent),
        bodyWeightKg: Number(cardioForm.bodyWeightKg || 70),
        durationMinutes: Number(cardioForm.durationMinutes || 0),
        intensity: cardioForm.intensity,
        exercises: [
          {
            name: cardioForm.activityType,
            durationMinutes: Number(cardioForm.durationMinutes || 0),
            intensity: cardioForm.intensity,
          },
        ],
      })

      setStatus('Cardio activity logged.')
      setSessionIntent({ foodPreference: '', musicPreference: '', preferenceNote: '' })
      setCardioForm((prev) => ({ ...prev, durationMinutes: '' }))
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setSaving((prev) => ({ ...prev, cardio: false }))
    }
  }

  const handleStepLog = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    const durationMinutes = Number(stepsForm.durationMinutes || 0)
    const manualSteps = Number(stepsForm.steps || 0)
    const estimatedSteps = manualSteps > 0 ? manualSteps : durationMinutes > 0 ? Math.round(durationMinutes * 110) : 0

    if (estimatedSteps <= 0) {
      setError('Provide steps, or duration to estimate steps.')
      return
    }

    try {
      setSaving((prev) => ({ ...prev, steps: true }))
      await logExerciseSteps({
        steps: estimatedSteps,
        durationMinutes,
        bodyWeightKg: Number(stepsForm.bodyWeightKg || 70),
        intensity: stepsForm.intensity,
      })

      setStatus('Steps activity logged.')
      setStepsForm((prev) => ({ ...prev, steps: '', durationMinutes: '' }))
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setSaving((prev) => ({ ...prev, steps: false }))
    }
  }

  const handleWearableSync = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!wearableForm.consentGiven) {
      setError('Enable consent to sync wearable data.')
      return
    }

    try {
      setSaving((prev) => ({ ...prev, wearable: true }))

      const entry = {
        workoutType: 'cardio',
        durationMinutes: Number(wearableForm.durationMinutes || 0),
        steps: Number(wearableForm.steps || 0),
        caloriesBurned: Number(wearableForm.caloriesBurned || 0),
        timestamp: new Date().toISOString(),
      }

      const data = await syncExerciseWearable({
        provider: wearableForm.provider,
        consentGiven: wearableForm.consentGiven,
        bodyWeightKg: Number(wearableForm.bodyWeightKg || 70),
        entries: entry.durationMinutes > 0 || entry.steps > 0 || entry.caloriesBurned > 0 ? [entry] : [],
      })

      setStatus(
        data.importedCount > 0
          ? `Wearable sync complete. Imported ${data.importedCount} entry.`
          : 'Wearable connected. No new activity imported.'
      )
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setSaving((prev) => ({ ...prev, wearable: false }))
    }
  }

  const openEditSession = (session) => {
    const firstExercise = session.exercises?.[0] || {}
    setEditingSession({
      id: session.id,
      workoutType: session.workoutType || 'strength',
      exerciseName: firstExercise.name || session.workoutType || 'exercise',
      sets: firstExercise.sets || 0,
      reps: firstExercise.reps || 0,
      weightKg: firstExercise.weightKg || 0,
      durationMinutes: session.durationMinutes || firstExercise.durationMinutes || 0,
      bodyWeightKg: session.bodyWeightKg || 70,
      intensity: firstExercise.intensity || 'moderate',
      steps: session.steps || 0,
      distanceMiles: session.distanceMiles || 0,
      notes: session.notes || '',
      timestamp: session.createdAt,
    })
  }

  const handleSaveSessionEdit = async () => {
    if (!editingSession?.id) {
      return
    }

    setError('')
    setStatus('')
    try {
      await updateExerciseSession(editingSession.id, {
        workoutType: editingSession.workoutType,
        durationMinutes: Number(editingSession.durationMinutes || 0),
        bodyWeightKg: Number(editingSession.bodyWeightKg || 70),
        intensity: editingSession.intensity || 'moderate',
        steps: Number(editingSession.steps || 0),
        distanceMiles: Number(editingSession.distanceMiles || 0),
        notes: editingSession.notes || '',
        timestamp: editingSession.timestamp,
        exercises: [
          {
            name: editingSession.exerciseName,
            sets: Number(editingSession.sets || 0),
            reps: Number(editingSession.reps || 0),
            weightKg: Number(editingSession.weightKg || 0),
            durationMinutes: Number(editingSession.durationMinutes || 0),
            intensity: editingSession.intensity || 'moderate',
          },
        ],
      })
      setEditingSession(null)
      setStatus('Exercise entry updated.')
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleDeleteSession = async (session) => {
    setError('')
    setStatus('')
    try {
      await deleteExerciseSession(session.id)
      setStatus('Exercise entry deleted.')
      if (editingSession?.id === session.id) {
        setEditingSession(null)
      }
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleContentFeedback = async (item, action) => {
    try {
      const workout = todayData?.workoutContext || {}
      const feedback = {
        recommendationEventId: item.recommendation?.recommendationEventId,
        itemId: item.id,
        title: item.title,
        contentType: item.type,
        artist: item.artist,
        genre: item.genre,
        mood: item.mood,
        energy: item.energy,
        tempo: item.tempo,
        durationSeconds: item.durationSeconds,
        tags: item.tags,
        activityType: workout.activityType,
        intensity: workout.intensity,
        durationMinutes: workout.durationMinutes,
        sessionClass: workout.sessionClass,
        reason: item.reason,
        confidence: item.confidence,
        confidencePct: item.confidencePct,
        sourceUrl: item.sourceUrl,
        contextType: 'workout',
        features: item.features,
      }
      if (action === 'save') {
        await saveContentForLater(feedback)
        setStatus('Saved for later.')
      } else {
        await sendContentFeedback({ ...feedback, action, score: item.score })
      }
      await loadData()
      setStatus(action === 'not_interested' ? 'Preference updated. Workout music refreshed.' : 'Choice saved. Workout music refreshed.')
    } catch (apiError) {
      const message = normalizeApiError(apiError)
      setError(message)
      throw new Error(message)
    }
  }

  if (loading) {
    return <section className="panel">Loading your workout history...</section>
  }

  return (
    <section className="page-grid single workout-page">
      <article className="panel panel-hero">
        <BackButton />
        <h1>Workout</h1>
        <p className="muted">Track workouts, cardio, and steps with practical calorie burn estimates.</p>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        {todayData?.workoutContext ? (
          <section className="workout-context">
            <p className="muted">Current session</p>
            <h2>{todayData.workoutContext.intensity} {todayData.workoutContext.activityType} · {todayData.workoutContext.durationMinutes} min</h2>
            <p className="muted">{todayData.workoutContext.sessionClass.replaceAll('_', ' ')}</p>
            {todayData.workoutContext.foodPreference || todayData.workoutContext.musicPreference ? (
              <p className="session-intent-summary">Food: {todayData.workoutContext.foodPreference || 'No preference'} · Music: {todayData.workoutContext.musicPreference || 'No preference'}</p>
            ) : null}
          </section>
        ) : null}

        <h2>Log new activity</h2>
        <div className="split-two">
          <article className="sub-panel">
            <h2>Strength Log</h2>
            <form className="form" onSubmit={handleStrengthLog}>
              <FieldInput
                label="Exercise Name"
                type="text"
                value={strengthForm.exerciseName}
                onChange={(event) => setStrengthForm((prev) => ({ ...prev, exerciseName: event.target.value }))}
              />
              <div className="split-three">
                <FieldInput
                  label="Sets"
                  type="number"
                  min="0"
                  value={strengthForm.sets}
                  onChange={(event) => setStrengthForm((prev) => ({ ...prev, sets: event.target.value }))}
                />
                <FieldInput
                  label="Reps"
                  type="number"
                  min="0"
                  value={strengthForm.reps}
                  onChange={(event) => setStrengthForm((prev) => ({ ...prev, reps: event.target.value }))}
                />
                <FieldInput
                  label="Weight (kg)"
                  type="number"
                  min="0"
                  value={strengthForm.weightKg}
                  onChange={(event) => setStrengthForm((prev) => ({ ...prev, weightKg: event.target.value }))}
                />
              </div>
              <div className="split-two">
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  max="350"
                  value={strengthForm.bodyWeightKg}
                  onChange={(event) => setStrengthForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))}
                />
                <FieldInput
                  label="Intensity"
                  as="select"
                  value={strengthForm.intensity}
                  onChange={(event) => setStrengthForm((prev) => ({ ...prev, intensity: event.target.value }))}
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                  <option value="high">High</option>
                </FieldInput>
              </div>
              <SessionIntentFields values={sessionIntent} onChange={setSessionIntent} idPrefix="strength" />
              <button className="button" type="submit" disabled={saving.strength}>
                {saving.strength ? 'Saving...' : 'Log Strength Workout'}
              </button>
            </form>
          </article>

          <article className="sub-panel">
            <h2>Cardio + Steps</h2>
            <form className="form" onSubmit={handleCardioLog}>
              <FieldInput
                label="Activity Type"
                as="select"
                value={cardioForm.activityType}
                onChange={(event) => setCardioForm((prev) => ({ ...prev, activityType: event.target.value }))}
              >
                <option value="running">Running</option>
                <option value="walking">Walking</option>
                <option value="cardio">Cardio</option>
              </FieldInput>
              <div className="split-three">
                <FieldInput
                  label="Duration (minutes)"
                  type="number"
                  min="0"
                  value={cardioForm.durationMinutes}
                  onChange={(event) => setCardioForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
                />
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  max="350"
                  value={cardioForm.bodyWeightKg}
                  onChange={(event) => setCardioForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))}
                />
                <FieldInput
                  label="Intensity"
                  as="select"
                  value={cardioForm.intensity}
                  onChange={(event) => setCardioForm((prev) => ({ ...prev, intensity: event.target.value }))}
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                  <option value="high">High</option>
                </FieldInput>
              </div>
              <SessionIntentFields values={sessionIntent} onChange={setSessionIntent} idPrefix="cardio" />
              <button className="button button-secondary" type="submit" disabled={saving.cardio}>
                {saving.cardio ? 'Saving...' : 'Log Cardio'}
              </button>
            </form>

            <form className="form" onSubmit={handleStepLog}>
              <h3>Step Tracking</h3>
              <div className="split-three">
                <FieldInput
                  label="Steps"
                  type="number"
                  min="0"
                  value={stepsForm.steps}
                  onChange={(event) => setStepsForm((prev) => ({ ...prev, steps: event.target.value }))}
                />
                <FieldInput
                  label="Duration (minutes)"
                  type="number"
                  min="0"
                  value={stepsForm.durationMinutes}
                  onChange={(event) => setStepsForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
                />
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  max="350"
                  value={stepsForm.bodyWeightKg}
                  onChange={(event) => setStepsForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))}
                />
              </div>
              <button className="button" type="submit" disabled={saving.steps}>
                {saving.steps ? 'Saving...' : 'Log Steps'}
              </button>
              <p className="muted">If steps are missing, an estimate is based on duration.</p>
            </form>
          </article>
        </div>

        {workoutMusicSuggestions.length ? (
          <section>
            <h2>Music for this workout</h2>
            <div className="content-reco-grid">
              {workoutMusicSuggestions.slice(0, 3).map((item, index) => (
                <SongRecommendationCard key={`exercise-content-${item.id}`} item={item} isTopRecommendation={index === 0} onFeedback={handleContentFeedback} />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2>Today's activity</h2>
          <div className="metrics-grid">
            <MetricCard label="Calories Burned" value={`${todaySummary?.totalCaloriesBurned || 0} kcal`} tone="success" />
            <MetricCard label="Workouts" value={`${todaySummary?.workoutsDone || 0}`} />
            <MetricCard label="Steps" value={`${todaySummary?.totalSteps || 0}`} />
            <MetricCard label="Duration" value={`${todaySummary?.totalDurationMinutes || 0} min`} />
          </div>
          <p className="estimation-note">Calorie burn uses standard MET estimates and varies by individual.</p>
        </section>

        <article className="sub-panel">
          <h2>Wearable Integration (Optional)</h2>
          <form className="form" onSubmit={handleWearableSync}>
            <div className="split-three">
              <FieldInput
                label="Provider"
                as="select"
                value={wearableForm.provider}
                onChange={(event) => setWearableForm((prev) => ({ ...prev, provider: event.target.value }))}
              >
                <option value="apple-health">Apple Health</option>
                <option value="google-fit">Google Fit</option>
                <option value="smartwatch">Fitbit / Smartwatch</option>
                <option value="manual">Manual</option>
              </FieldInput>
              <FieldInput
                label="Body Weight (kg)"
                type="number"
                min="20"
                max="350"
                value={wearableForm.bodyWeightKg}
                onChange={(event) => setWearableForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))}
              />
              <FieldInput
                label="Device Calories"
                type="number"
                min="0"
                value={wearableForm.caloriesBurned}
                onChange={(event) => setWearableForm((prev) => ({ ...prev, caloriesBurned: event.target.value }))}
              />
            </div>
            <div className="split-two">
              <FieldInput
                label="Device Duration (minutes)"
                type="number"
                min="0"
                value={wearableForm.durationMinutes}
                onChange={(event) => setWearableForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
              />
              <FieldInput
                label="Device Steps"
                type="number"
                min="0"
                value={wearableForm.steps}
                onChange={(event) => setWearableForm((prev) => ({ ...prev, steps: event.target.value }))}
              />
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wearableForm.consentGiven}
                onChange={(event) =>
                  setWearableForm((prev) => ({
                    ...prev,
                    consentGiven: event.target.checked,
                  }))
                }
              />
              <span>I allow the app to use wearable data</span>
            </label>
            <button className="button" type="submit" disabled={saving.wearable}>
              {saving.wearable ? 'Syncing...' : 'Connect / Sync Wearable'}
            </button>
          </form>
        </article>

        <article className="sub-panel">
          <h2>Recent Exercise History</h2>
          {historyData?.sessions?.length ? (
            <ul className="activity-list">
              {historyData.sessions.slice(0, 12).map((session) => (
                <li key={session.id} className="activity-item">
                  <p>
                    <strong>{session.workoutType}</strong> | {session.caloriesBurned} kcal
                  </p>
                  <p className="muted">
                    {session.durationMinutes} min | {session.steps || 0} steps | {session.source}
                  </p>
                  <p className="muted">{formatDate(session.createdAt)}</p>
                  <div className="inline-actions">
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => openEditSession(session)}
                      disabled={String(session.createdAt || '').slice(0, 10) !== todayKey}
                      title={
                        String(session.createdAt || '').slice(0, 10) !== todayKey
                          ? 'Past entries cannot be modified'
                          : 'Edit exercise'
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => handleDeleteSession(session)}
                      disabled={String(session.createdAt || '').slice(0, 10) !== todayKey}
                      title={
                        String(session.createdAt || '').slice(0, 10) !== todayKey
                          ? 'Past entries cannot be modified'
                          : 'Delete exercise'
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No exercise history" description="Your logged workouts and synced activities will appear here." />
          )}
        </article>

        {editingSession ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <article className="modal-card">
              <h3>Edit Exercise Entry</h3>
              <div className="split-two">
                <FieldInput
                  label="Workout Type"
                  type="text"
                  value={editingSession.workoutType}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, workoutType: event.target.value }))
                  }
                />
                <FieldInput
                  label="Exercise Name"
                  type="text"
                  value={editingSession.exerciseName}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, exerciseName: event.target.value }))
                  }
                />
              </div>
              <div className="split-three">
                <FieldInput
                  label="Sets"
                  type="number"
                  min="0"
                  value={editingSession.sets}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, sets: event.target.value }))
                  }
                />
                <FieldInput
                  label="Reps"
                  type="number"
                  min="0"
                  value={editingSession.reps}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, reps: event.target.value }))
                  }
                />
                <FieldInput
                  label="Weight (kg)"
                  type="number"
                  min="0"
                  value={editingSession.weightKg}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, weightKg: event.target.value }))
                  }
                />
              </div>
              <div className="split-three">
                <FieldInput
                  label="Duration (min)"
                  type="number"
                  min="0"
                  value={editingSession.durationMinutes}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, durationMinutes: event.target.value }))
                  }
                />
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  value={editingSession.bodyWeightKg}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, bodyWeightKg: event.target.value }))
                  }
                />
                <FieldInput
                  label="Intensity"
                  as="select"
                  value={editingSession.intensity}
                  onChange={(event) =>
                    setEditingSession((prev) => ({ ...prev, intensity: event.target.value }))
                  }
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                  <option value="high">High</option>
                </FieldInput>
              </div>
              <div className="inline-actions">
                <button className="button" type="button" onClick={handleSaveSessionEdit}>
                  Save
                </button>
                <button className="button button-ghost" type="button" onClick={() => setEditingSession(null)}>
                  Cancel
                </button>
              </div>
            </article>
          </div>
        ) : null}
      </article>
    </section>
  )
}
