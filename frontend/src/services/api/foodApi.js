import apiClient, { unwrapResponse } from './client'

export async function lookupFood(payload) {
  const response = await apiClient.post('/food/lookup', payload)
  return unwrapResponse(response)
}

export async function searchAnyFood(payload) {
  const response = await apiClient.post('/food/search', payload)
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
