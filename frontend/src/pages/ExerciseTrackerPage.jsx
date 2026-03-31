import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import MetricCard from '../components/MetricCard'
import { normalizeApiError } from '../services/api/client'
import {
  fetchExerciseHistory,
  fetchTodayExerciseSummary,
  logExerciseSteps,
  logExerciseWorkout,
  syncExerciseWearable,
} from '../services/api/exerciseApi'

function createExerciseRow() {
  return {
    name: '',
    sets: '',
    reps: '',
    weightKg: '',
    durationMinutes: '',
    intensity: 'moderate',
  }
}

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

export default function ExerciseTrackerPage() {
  const [todayData, setTodayData] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [workoutForm, setWorkoutForm] = useState({
    workoutType: 'strength',
    bodyWeightKg: '70',
    durationMinutes: '',
    notes: '',
  })
  const [exerciseRows, setExerciseRows] = useState([createExerciseRow()])
  const [isLoggingWorkout, setIsLoggingWorkout] = useState(false)

  const [stepsForm, setStepsForm] = useState({
    steps: '',
    distanceMiles: '',
    durationMinutes: '',
    bodyWeightKg: '70',
    intensity: 'moderate',
    notes: '',
  })
  const [isLoggingSteps, setIsLoggingSteps] = useState(false)

  const [syncForm, setSyncForm] = useState({
    provider: 'apple-health',
    consentGiven: false,
    bodyWeightKg: '70',
    workoutType: 'cardio',
    durationMinutes: '',
    steps: '',
    distanceMiles: '',
    caloriesBurned: '',
    intensity: 'moderate',
    notes: '',
  })
  const [isSyncing, setIsSyncing] = useState(false)

  const loadExerciseData = async () => {
    try {
      setLoading(true)
      const [today, history] = await Promise.all([fetchTodayExerciseSummary(), fetchExerciseHistory(180)])
      setTodayData(today)
      setHistoryData(history)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExerciseData()
  }, [])

  const todaySummary = todayData?.summary
  const transparency = todayData?.transparency || historyData?.transparency

  const workoutTypeBreakdown = todaySummary?.byWorkoutType || []

  const handleExerciseField = (index, field, value) => {
    setExerciseRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    )
  }

  const handleAddExerciseRow = () => {
    setExerciseRows((prev) => [...prev, createExerciseRow()])
  }

  const handleRemoveExerciseRow = (index) => {
    setExerciseRows((prev) => {
      if (prev.length === 1) {
        return prev
      }

      return prev.filter((_, rowIndex) => rowIndex !== index)
    })
  }

  const handleLogWorkout = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    try {
      const normalizedExercises = exerciseRows
        .filter((row) => row.name.trim())
        .map((row) => ({
          name: row.name.trim(),
          sets: row.sets ? Number(row.sets) : 0,
          reps: row.reps ? Number(row.reps) : 0,
          weightKg: row.weightKg ? Number(row.weightKg) : 0,
          durationMinutes: row.durationMinutes ? Number(row.durationMinutes) : 0,
          intensity: row.intensity || 'moderate',
        }))

      if (!normalizedExercises.length) {
        setError('Add at least one named exercise before logging a workout.')
        return
      }

      setIsLoggingWorkout(true)
      await logExerciseWorkout({
        workoutType: workoutForm.workoutType,
        exercises: normalizedExercises,
        bodyWeightKg: Number(workoutForm.bodyWeightKg || 70),
        durationMinutes: workoutForm.durationMinutes ? Number(workoutForm.durationMinutes) : undefined,
        notes: workoutForm.notes,
      })

      setStatus('Workout saved with MET-based calorie estimation.')
      setExerciseRows([createExerciseRow()])
      setWorkoutForm((prev) => ({ ...prev, durationMinutes: '', notes: '' }))
      await loadExerciseData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsLoggingWorkout(false)
    }
  }

  const handleLogSteps = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    try {
      setIsLoggingSteps(true)
      await logExerciseSteps({
        steps: stepsForm.steps ? Number(stepsForm.steps) : 0,
        distanceMiles: stepsForm.distanceMiles ? Number(stepsForm.distanceMiles) : 0,
        durationMinutes: stepsForm.durationMinutes ? Number(stepsForm.durationMinutes) : 0,
        bodyWeightKg: Number(stepsForm.bodyWeightKg || 70),
        intensity: stepsForm.intensity,
        notes: stepsForm.notes,
      })

      setStatus('Steps activity logged.')
      setStepsForm((prev) => ({
        ...prev,
        steps: '',
        distanceMiles: '',
        durationMinutes: '',
        notes: '',
      }))
      await loadExerciseData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsLoggingSteps(false)
    }
  }

  const handleWearableSync = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    try {
      setIsSyncing(true)
      const hasEntryData = [
        syncForm.durationMinutes,
        syncForm.steps,
        syncForm.distanceMiles,
        syncForm.caloriesBurned,
      ].some((value) => String(value || '').trim() !== '')

      const entries = hasEntryData
        ? [
            {
              workoutType: syncForm.workoutType,
              durationMinutes: syncForm.durationMinutes ? Number(syncForm.durationMinutes) : 0,
              steps: syncForm.steps ? Number(syncForm.steps) : 0,
              distanceMiles: syncForm.distanceMiles ? Number(syncForm.distanceMiles) : 0,
              caloriesBurned: syncForm.caloriesBurned ? Number(syncForm.caloriesBurned) : 0,
              intensity: syncForm.intensity,
              notes: syncForm.notes,
              timestamp: new Date().toISOString(),
            },
          ]
        : []

      const data = await syncExerciseWearable({
        provider: syncForm.provider,
        consentGiven: syncForm.consentGiven,
        bodyWeightKg: Number(syncForm.bodyWeightKg || 70),
        entries,
      })

      setStatus(
        data.importedCount > 0
          ? `Wearable sync complete. Imported ${data.importedCount} session(s).`
          : 'Wearable connected. No entries imported yet.'
      )
      await loadExerciseData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSyncing(false)
    }
  }

  if (loading) {
    return <section className="panel">Loading BFIT exercise tracker...</section>
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>BFIT Exercise Tracker</h1>
        <p className="muted">
          Track workouts, steps, and wearable activity with transparent MET-based calorie burn estimation.
        </p>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        <div className="metrics-grid">
          <MetricCard
            label="Calories Burned Today"
            value={`${todaySummary?.totalCaloriesBurned || 0} kcal`}
            tone="success"
            hint="MET formula estimate"
          />
          <MetricCard
            label="Workouts Logged"
            value={`${todaySummary?.workoutsDone || 0}`}
            hint={`${todaySummary?.strengthWorkouts || 0} strength session(s)`}
          />
          <MetricCard
            label="Steps Today"
            value={`${todaySummary?.totalSteps || 0}`}
            hint={`${todaySummary?.totalDistanceMiles || 0} miles estimated`}
          />
          <MetricCard
            label="Active Minutes"
            value={`${todaySummary?.totalDurationMinutes || 0} min`}
            hint="Across all sessions today"
          />
        </div>

        {transparency ? (
          <article className="recommendation-box">
            <p className="recommendation-title">Transparency</p>
            <p className="muted">{transparency.notice}</p>
            <p className="muted">{transparency.source}</p>
          </article>
        ) : null}

        <div className="split-two">
          <article className="sub-panel">
            <h2>Log Workout</h2>
            <form className="form" onSubmit={handleLogWorkout}>
              <div className="split-three">
                <FieldInput
                  label="Workout Type"
                  as="select"
                  value={workoutForm.workoutType}
                  onChange={(event) =>
                    setWorkoutForm((prev) => ({ ...prev, workoutType: event.target.value }))
                  }
                >
                  <option value="chest">Chest</option>
                  <option value="back">Back</option>
                  <option value="legs">Legs</option>
                  <option value="strength">Strength</option>
                  <option value="cardio">Cardio</option>
                  <option value="running">Running</option>
                  <option value="walking">Walking</option>
                </FieldInput>

                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  max="350"
                  value={workoutForm.bodyWeightKg}
                  onChange={(event) =>
                    setWorkoutForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))
                  }
                />

                <FieldInput
                  label="Session Duration (minutes)"
                  type="number"
                  min="0"
                  max="600"
                  value={workoutForm.durationMinutes}
                  onChange={(event) =>
                    setWorkoutForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                  }
                />
              </div>

              {exerciseRows.map((exercise, index) => (
                <div key={`exercise-row-${index}`} className="sub-panel">
                  <div className="split-three">
                    <FieldInput
                      label={`Exercise ${index + 1}`}
                      type="text"
                      placeholder="bench press, squats, push-ups"
                      value={exercise.name}
                      onChange={(event) => handleExerciseField(index, 'name', event.target.value)}
                    />
                    <FieldInput
                      label="Sets"
                      type="number"
                      min="0"
                      max="200"
                      value={exercise.sets}
                      onChange={(event) => handleExerciseField(index, 'sets', event.target.value)}
                    />
                    <FieldInput
                      label="Reps"
                      type="number"
                      min="0"
                      max="500"
                      value={exercise.reps}
                      onChange={(event) => handleExerciseField(index, 'reps', event.target.value)}
                    />
                  </div>
                  <div className="split-three">
                    <FieldInput
                      label="Weight (kg)"
                      type="number"
                      min="0"
                      max="600"
                      value={exercise.weightKg}
                      onChange={(event) => handleExerciseField(index, 'weightKg', event.target.value)}
                    />
                    <FieldInput
                      label="Exercise Duration (minutes)"
                      type="number"
                      min="0"
                      max="600"
                      value={exercise.durationMinutes}
                      onChange={(event) =>
                        handleExerciseField(index, 'durationMinutes', event.target.value)
                      }
                    />
                    <FieldInput
                      label="Intensity"
                      as="select"
                      value={exercise.intensity}
                      onChange={(event) => handleExerciseField(index, 'intensity', event.target.value)}
                    >
                      <option value="light">Light</option>
                      <option value="moderate">Moderate</option>
                      <option value="intense">Intense</option>
                      <option value="high">High</option>
                    </FieldInput>
                  </div>
                  <button
                    className="button button-ghost"
                    type="button"
                    onClick={() => handleRemoveExerciseRow(index)}
                    disabled={exerciseRows.length === 1}
                  >
                    Remove Exercise
                  </button>
                </div>
              ))}

              <FieldInput
                label="Notes"
                as="textarea"
                rows="2"
                value={workoutForm.notes}
                onChange={(event) => setWorkoutForm((prev) => ({ ...prev, notes: event.target.value }))}
              />

              <div className="inline-actions">
                <button className="button button-secondary" type="button" onClick={handleAddExerciseRow}>
                  Add Another Exercise
                </button>
                <button className="button" type="submit" disabled={isLoggingWorkout}>
                  {isLoggingWorkout ? 'Saving Workout...' : 'Save Workout'}
                </button>
              </div>
            </form>
          </article>

          <article className="sub-panel">
            <h2>Steps + Wearable Sync</h2>

            <form className="form" onSubmit={handleLogSteps}>
              <h3>Manual Steps Log</h3>
              <div className="split-three">
                <FieldInput
                  label="Steps"
                  type="number"
                  min="0"
                  max="200000"
                  value={stepsForm.steps}
                  onChange={(event) => setStepsForm((prev) => ({ ...prev, steps: event.target.value }))}
                />
                <FieldInput
                  label="Distance (miles)"
                  type="number"
                  min="0"
                  max="200"
                  step="0.1"
                  value={stepsForm.distanceMiles}
                  onChange={(event) =>
                    setStepsForm((prev) => ({ ...prev, distanceMiles: event.target.value }))
                  }
                />
                <FieldInput
                  label="Duration (minutes)"
                  type="number"
                  min="0"
                  max="600"
                  value={stepsForm.durationMinutes}
                  onChange={(event) =>
                    setStepsForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                  }
                />
              </div>
              <div className="split-three">
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  max="350"
                  value={stepsForm.bodyWeightKg}
                  onChange={(event) =>
                    setStepsForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))
                  }
                />
                <FieldInput
                  label="Intensity"
                  as="select"
                  value={stepsForm.intensity}
                  onChange={(event) => setStepsForm((prev) => ({ ...prev, intensity: event.target.value }))}
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                  <option value="high">High</option>
                </FieldInput>
                <FieldInput
                  label="Notes"
                  type="text"
                  value={stepsForm.notes}
                  onChange={(event) => setStepsForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <button className="button" type="submit" disabled={isLoggingSteps}>
                {isLoggingSteps ? 'Logging Steps...' : 'Log Steps Activity'}
              </button>
            </form>

            <form className="form" onSubmit={handleWearableSync}>
              <h3>Wearable Integration (Optional)</h3>
              <div className="split-three">
                <FieldInput
                  label="Provider"
                  as="select"
                  value={syncForm.provider}
                  onChange={(event) => setSyncForm((prev) => ({ ...prev, provider: event.target.value }))}
                >
                  <option value="apple-health">Apple Health</option>
                  <option value="google-fit">Google Fit</option>
                  <option value="smartwatch">Smartwatch</option>
                  <option value="manual">Manual Import</option>
                </FieldInput>
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  max="350"
                  value={syncForm.bodyWeightKg}
                  onChange={(event) =>
                    setSyncForm((prev) => ({ ...prev, bodyWeightKg: event.target.value }))
                  }
                />
                <FieldInput
                  label="Activity Type"
                  as="select"
                  value={syncForm.workoutType}
                  onChange={(event) => setSyncForm((prev) => ({ ...prev, workoutType: event.target.value }))}
                >
                  <option value="cardio">Cardio</option>
                  <option value="walking">Walking</option>
                  <option value="running">Running</option>
                  <option value="strength">Strength</option>
                </FieldInput>
              </div>

              <div className="split-three">
                <FieldInput
                  label="Duration (minutes)"
                  type="number"
                  min="0"
                  max="600"
                  value={syncForm.durationMinutes}
                  onChange={(event) =>
                    setSyncForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                  }
                />
                <FieldInput
                  label="Steps"
                  type="number"
                  min="0"
                  max="200000"
                  value={syncForm.steps}
                  onChange={(event) => setSyncForm((prev) => ({ ...prev, steps: event.target.value }))}
                />
                <FieldInput
                  label="Distance (miles)"
                  type="number"
                  min="0"
                  max="200"
                  step="0.1"
                  value={syncForm.distanceMiles}
                  onChange={(event) =>
                    setSyncForm((prev) => ({ ...prev, distanceMiles: event.target.value }))
                  }
                />
              </div>

              <div className="split-three">
                <FieldInput
                  label="Calories Burned (if device provides)"
                  type="number"
                  min="0"
                  max="5000"
                  value={syncForm.caloriesBurned}
                  onChange={(event) =>
                    setSyncForm((prev) => ({ ...prev, caloriesBurned: event.target.value }))
                  }
                />
                <FieldInput
                  label="Intensity"
                  as="select"
                  value={syncForm.intensity}
                  onChange={(event) => setSyncForm((prev) => ({ ...prev, intensity: event.target.value }))}
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                  <option value="high">High</option>
                </FieldInput>
                <FieldInput
                  label="Notes"
                  type="text"
                  value={syncForm.notes}
                  onChange={(event) => setSyncForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={syncForm.consentGiven}
                  onChange={(event) =>
                    setSyncForm((prev) => ({ ...prev, consentGiven: event.target.checked }))
                  }
                />
                <span>I allow BFIT to import wearable exercise data.</span>
              </label>

              <button className="button" type="submit" disabled={isSyncing}>
                {isSyncing ? 'Syncing...' : 'Sync Wearable'}
              </button>
            </form>
          </article>
        </div>

        <article className="sub-panel">
          <h2>Today Activity Breakdown</h2>
          {workoutTypeBreakdown.length ? (
            <ul className="activity-list">
              {workoutTypeBreakdown.map((item) => (
                <li key={item.workoutType} className="activity-item">
                  <p>
                    <strong>{item.workoutType}</strong>
                  </p>
                  <p className="muted">
                    {item.sessions} session(s) | {item.durationMinutes} minutes | {item.caloriesBurned} kcal
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No workouts yet" description="Log a workout or steps to see your activity breakdown." />
          )}
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
                    {session.durationMinutes} minutes | {session.steps || 0} steps | {session.distanceMiles || 0} miles
                  </p>
                  <p className="muted">
                    Source: {session.source} ({session.provider}) | {formatDate(session.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No exercise history" description="Your logged workouts and synced activities will appear here." />
          )}
        </article>
      </article>
    </section>
  )
}
