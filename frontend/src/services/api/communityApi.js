import apiClient, { unwrapResponse } from './client'

export async function fetchCommunityRecipes(limit = 40) {
  const response = await apiClient.get('/community/recipes', {
    params: { limit },
  })
  return unwrapResponse(response)
}

export async function fetchCommunityRecipe(recipeId) {
  const response = await apiClient.get(`/community/recipes/${recipeId}`)
  return unwrapResponse(response)
}

export async function createCommunityRecipe(payload) {
  const response = await apiClient.post('/community/recipes', payload)
  return unwrapResponse(response)
}

export async function addCommunityRecipeReview(recipeId, payload) {
  const response = await apiClient.post(`/community/recipes/${recipeId}/reviews`, payload)
  return unwrapResponse(response)
}

export async function toggleSaveCommunityRecipe(recipeId) {
  const response = await apiClient.post(`/community/recipes/${recipeId}/save`)
  return unwrapResponse(response)
}
