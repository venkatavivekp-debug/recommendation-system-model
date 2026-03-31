import apiClient, { unwrapResponse } from './client'

export async function buildMealPlan(payload) {
  const response = await apiClient.post('/meal-builder', payload)
  return unwrapResponse(response)
}

export async function buildRecipeSuggestions(payload) {
  const response = await apiClient.post('/meal-builder/recipes', payload)
  return unwrapResponse(response)
}
