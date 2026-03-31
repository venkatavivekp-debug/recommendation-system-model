import apiClient, { unwrapResponse } from './client'

export async function searchFood(payload) {
  const response = await apiClient.post('/search', payload)
  return unwrapResponse(response)
}
