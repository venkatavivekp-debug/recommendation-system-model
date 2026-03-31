import apiClient, { unwrapResponse } from './client'

export async function fetchProfile() {
  const response = await apiClient.get('/profile/me')
  return unwrapResponse(response)
}

export async function updateProfile(payload) {
  const response = await apiClient.put('/profile/me', payload)
  return unwrapResponse(response)
}

export async function addPaymentCard(payload) {
  const response = await apiClient.post('/profile/me/cards', payload)
  return unwrapResponse(response)
}

export async function removePaymentCard(cardId) {
  const response = await apiClient.delete(`/profile/me/cards/${cardId}`)
  return unwrapResponse(response)
}
