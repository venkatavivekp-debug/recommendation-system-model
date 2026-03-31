import apiClient, { unwrapResponse } from './client'

export async function searchFriendUsers(email) {
  const response = await apiClient.get('/friends/search', {
    params: { email },
  })
  return unwrapResponse(response)
}

export async function sendFriendRequest(payload) {
  const response = await apiClient.post('/friends/request', payload)
  return unwrapResponse(response)
}

export async function acceptFriendRequest(requestId) {
  const response = await apiClient.post('/friends/accept', { requestId })
  return unwrapResponse(response)
}

export async function rejectFriendRequest(requestId) {
  const response = await apiClient.post('/friends/reject', { requestId })
  return unwrapResponse(response)
}

export async function fetchFriendsList() {
  const response = await apiClient.get('/friends/list')
  return unwrapResponse(response)
}

export async function fetchFriendRequests() {
  const response = await apiClient.get('/friends/requests')
  return unwrapResponse(response)
}
