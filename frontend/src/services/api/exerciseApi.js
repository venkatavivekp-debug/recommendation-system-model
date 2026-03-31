import apiClient, { unwrapResponse } from './client'

export async function logExerciseWorkout(payload) {
  const response = await apiClient.post('/exercises/log', payload)
  return unwrapResponse(response)
}

export async function logExerciseSteps(payload) {
  const response = await apiClient.post('/exercises/steps', payload)
  return unwrapResponse(response)
}

export async function syncExerciseWearable(payload) {
  const response = await apiClient.post('/exercises/sync', payload)
  return unwrapResponse(response)
}

export async function updateExerciseSession(sessionId, payload) {
  const response = await apiClient.put(`/exercise/${sessionId}`, payload)
  return unwrapResponse(response)
}

export async function deleteExerciseSession(sessionId) {
  const response = await apiClient.delete(`/exercise/${sessionId}`)
  return unwrapResponse(response)
}

export async function fetchTodayExerciseSummary() {
  const response = await apiClient.get('/exercises/today')
  return unwrapResponse(response)
}

export async function fetchExerciseHistory(limit = 180) {
  const response = await apiClient.get('/exercises/history', {
    params: { limit },
  })
  return unwrapResponse(response)
}
