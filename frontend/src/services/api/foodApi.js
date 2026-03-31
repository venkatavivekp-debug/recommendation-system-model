import apiClient, { unwrapResponse } from './client'

export async function lookupFood(payload) {
  const response = await apiClient.post('/food/lookup', payload)
  return unwrapResponse(response)
}

export async function searchAnyFood(payload) {
  const response = await apiClient.post('/food/search', payload)
  return unwrapResponse(response)
}
