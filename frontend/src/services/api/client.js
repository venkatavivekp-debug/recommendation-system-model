import axios from 'axios'

function normalizeBaseUrl(value) {
  const fallback = 'http://localhost:5001'
  const raw = String(value || fallback).trim().replace(/\/+$/, '').replace(/\/api$/i, '')

  try {
    const parsed = new URL(raw)
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      (parsed.port === '5000' || parsed.port === '5050')
    ) {
      parsed.port = '5001'
    }
    return parsed.origin
  } catch {
    return fallback
  }
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001')
const API_PREFIX = '/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const requestUrl = String(config.url || '')
  if (!/^https?:\/\//i.test(requestUrl) && !requestUrl.startsWith(API_PREFIX)) {
    config.url = `${API_PREFIX}${requestUrl.startsWith('/') ? '' : '/'}${requestUrl}`
  }

  const token = localStorage.getItem('recommendation_model_token')

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
  if (typeof details === 'string' && details.trim()) {
    return details
  }

  if (details?.details && Array.isArray(details.details) && details.details.length > 0) {
    return details.details.map((item) => item.message).join(', ')
  }

  return details?.message || error?.response?.data?.message || error.message || 'Something went wrong'
}

export default apiClient
