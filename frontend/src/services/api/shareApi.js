import apiClient, { unwrapResponse } from './client'

export async function shareDiet(payload) {
  const response = await apiClient.post('/share/diet', payload)
  return unwrapResponse(response)
}

export async function fetchDietShareInbox(limit = 40) {
  const response = await apiClient.get('/share/diet/inbox', {
    params: { limit },
  })
  return unwrapResponse(response)
}

export async function shareRecipe(payload) {
  const response = await apiClient.post('/recipes/share', payload)
  return unwrapResponse(response)
}

export async function fetchFriendsRecipes(limit = 40) {
  const response = await apiClient.get('/recipes/friends', {
    params: { limit },
  })
  return unwrapResponse(response)
}

export async function fetchPublicRecipes(limit = 40) {
  const response = await apiClient.get('/recipes/public', {
    params: { limit },
  })
  return unwrapResponse(response)
}
