import apiClient, { unwrapResponse } from './client'

export async function shareViaEmail(payload) {
  const response = await apiClient.post('/share/email', payload)
  return unwrapResponse(response)
}
