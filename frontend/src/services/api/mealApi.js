import apiClient, { unwrapResponse } from './client'

export async function addMeal(payload) {
  const response = await apiClient.post('/meals', payload)
  return unwrapResponse(response)
}

export async function updateMeal(mealId, payload) {
  const response = await apiClient.put(`/meals/${mealId}`, payload)
  return unwrapResponse(response)
}

export async function deleteMeal(mealId) {
  const response = await apiClient.delete(`/meals/${mealId}`)
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
