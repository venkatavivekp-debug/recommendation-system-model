import apiClient, { unwrapResponse } from './client'

export async function registerUser(payload) {
  const response = await apiClient.post('/auth/register', payload)
  return response?.data
}

export async function verifyEmail(payload) {
  const response = await apiClient.post('/auth/verify-email', payload)
  return unwrapResponse(response)
}

export async function loginUser(payload) {
  const response = await apiClient.post('/auth/login', payload)
  return unwrapResponse(response)
}

export async function logoutUser() {
  const response = await apiClient.post('/auth/logout')
  return unwrapResponse(response)
}

export async function forgotPassword(payload) {
  const response = await apiClient.post('/auth/forgot-password', payload)
  return unwrapResponse(response)
}

export async function resetPassword(payload) {
  const response = await apiClient.post('/auth/reset-password', payload)
  return unwrapResponse(response)
}

export async function changePassword(payload) {
  const response = await apiClient.post('/auth/change-password', payload)
  return unwrapResponse(response)
}
