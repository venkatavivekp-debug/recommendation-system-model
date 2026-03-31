import apiClient, { unwrapResponse } from './client'

export async function fetchRemainingNutrition(params = {}) {
  const response = await apiClient.get('/nutrition/remaining', { params })
  return unwrapResponse(response)
}
