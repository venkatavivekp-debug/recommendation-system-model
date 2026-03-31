import apiClient, { unwrapResponse } from './client'

export async function fetchActivities(limit = 30) {
  const response = await apiClient.get('/activities', {
    params: { limit },
  })

  return unwrapResponse(response)
}

export async function createActivity(payload) {
  const response = await apiClient.post('/activities', payload)
  return unwrapResponse(response)
}
