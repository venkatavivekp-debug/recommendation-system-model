import apiClient, { unwrapResponse } from './client'

export async function fetchRouteSummary(payload) {
  const response = await apiClient.post('/routes', payload)
  return unwrapResponse(response)
}
