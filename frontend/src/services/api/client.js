import axios from 'axios'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')
const API_PREFIX = '/api'
const BASE_HAS_API_PREFIX = /\/api$/i.test(API_BASE_URL)

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const requestUrl = String(config.url || '')
  if (
    !BASE_HAS_API_PREFIX &&
    !/^https?:\/\//i.test(requestUrl) &&
    !requestUrl.startsWith(API_PREFIX)
  ) {
    config.url = `${API_PREFIX}${requestUrl.startsWith('/') ? '' : '/'}${requestUrl}`
  }

  const token =
    localStorage.getItem('contextfit_token') ||
    localStorage.getItem('bfit_token') ||
    localStorage.getItem('foodfit_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export function unwrapResponse(response) {
  return response?.data?.data
}

export function normalizeApiError(error) {
  if (!error?.response) {
    return 'Server unavailable'
  }

  const details = error?.response?.data?.error

  if (details?.details && Array.isArray(details.details) && details.details.length > 0) {
    return details.details.map((item) => item.message).join(', ')
  }

  return details?.message || error.message || 'Something went wrong'
}

export default apiClient
