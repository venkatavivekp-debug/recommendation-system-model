import apiClient, { unwrapResponse } from './client'

export async function sendChatMessage(payload) {
  const response = await apiClient.post('/chat/send', payload)
  return unwrapResponse(response)
}

export async function fetchChatMessages(peerUserId, limit = 120) {
  const response = await apiClient.get('/chat/messages', {
    params: {
      peerUserId,
      limit,
    },
  })
  return unwrapResponse(response)
}
