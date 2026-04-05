import apiClient, { unwrapResponse } from './client'

export async function fetchContentRecommendations(params = {}) {
  const response = await apiClient.get('/content/recommendations', {
    params,
  })
  return unwrapResponse(response)
}

export async function sendContentFeedback(payload) {
  const response = await apiClient.post('/content/feedback', payload)
  return unwrapResponse(response)
}

export async function saveContentForLater(payload) {
  const response = await apiClient.post('/content/save', payload)
  return unwrapResponse(response)
}

export async function fetchSavedContent(params = {}) {
  const response = await apiClient.get('/content/saved', {
    params,
  })
  return unwrapResponse(response)
}
