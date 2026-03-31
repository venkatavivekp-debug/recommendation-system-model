import apiClient, { unwrapResponse } from './client'

export async function addMeal(payload) {
  const response = await apiClient.post('/meals', payload)
  return unwrapResponse(response)
}

export async function fetchTodayMeals() {
  const response = await apiClient.get('/meals/today')
  return unwrapResponse(response)
}

export async function fetchMealHistory(limit = 120) {
  const response = await apiClient.get('/meals/history', {
    params: { limit },
  })
  return unwrapResponse(response)
}
