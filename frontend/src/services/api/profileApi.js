import apiClient, { unwrapResponse } from './client'

export async function fetchProfile() {
  const response = await apiClient.get('/profile/me')
  return unwrapResponse(response)
}

export async function updateProfile(payload) {
  const response = await apiClient.put('/profile/me', payload)
  return unwrapResponse(response)
}
