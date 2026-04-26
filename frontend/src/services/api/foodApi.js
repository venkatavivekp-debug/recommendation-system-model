import apiClient, { unwrapResponse } from './client'

const FOOD_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const foodSearchCache = new Map()

function buildFoodSearchKey(payload = {}) {
  return String(payload.query || '')
    .trim()
    .toLowerCase()
}

export async function lookupFood(payload) {
  const response = await apiClient.post('/food/lookup', payload)
  return unwrapResponse(response)
}

export async function searchAnyFood(payload, options = {}) {
  const key = buildFoodSearchKey(payload)
  const forceRefresh = Boolean(options.forceRefresh)
  const now = Date.now()

  if (!forceRefresh && key) {
    const cached = foodSearchCache.get(key)
    if (cached && now - cached.timestamp < FOOD_SEARCH_CACHE_TTL_MS) {
      return cached.data
    }
  }

  const response = await apiClient.post('/food/search', payload)
  const data = unwrapResponse(response)
  if (key) {
    foodSearchCache.set(key, {
      timestamp: now,
      data,
    })
  }
  return data
}

export async function fetchFoodRecommendations(params = {}) {
  const response = await apiClient.get('/food/recommendations', {
    params,
  })
  return unwrapResponse(response)
}

export async function sendFoodFeedback(payload) {
  const response = await apiClient.post('/food/feedback', payload)
  return unwrapResponse(response)
}

export async function detectFoodFromMedia({ file, lat, lng, radius }) {
  const formData = new FormData()
  if (file) {
    formData.append('file', file)
  }
  if (lat !== undefined && lat !== null && lat !== '') {
    formData.append('lat', String(lat))
  }
  if (lng !== undefined && lng !== null && lng !== '') {
    formData.append('lng', String(lng))
  }
  if (radius !== undefined && radius !== null && radius !== '') {
    formData.append('radius', String(radius))
  }

  const response = await apiClient.post('/food/detect', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return unwrapResponse(response)
}
