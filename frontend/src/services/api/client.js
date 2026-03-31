import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('bfit_token') || localStorage.getItem('foodfit_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export function unwrapResponse(response) {
  return response?.data?.data
}

export function normalizeApiError(error) {
  const details = error?.response?.data?.error

  if (details?.details && Array.isArray(details.details) && details.details.length > 0) {
    return details.details.map((item) => item.message).join(', ')
  }

  return details?.message || error.message || 'Something went wrong'
}

export default apiClient
