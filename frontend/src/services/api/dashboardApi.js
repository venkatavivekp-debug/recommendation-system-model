import apiClient, { unwrapResponse } from './client'

export async function fetchDashboardSummary() {
  const response = await apiClient.get('/dashboard')
  return unwrapResponse(response)
}
