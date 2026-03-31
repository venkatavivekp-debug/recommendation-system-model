import apiClient, { unwrapResponse } from './client'

export async function fetchCalendarHistory(months = 4) {
  const response = await apiClient.get('/calendar/history', {
    params: { months },
  })
  return unwrapResponse(response)
}

export async function fetchCalendarDay(date) {
  const response = await apiClient.get(`/calendar/day/${date}`)
  return unwrapResponse(response)
}

export async function saveCalendarPlan(payload) {
  const response = await apiClient.post('/calendar/plan', payload)
  return unwrapResponse(response)
}

export async function fetchUpcomingPlans() {
  const response = await apiClient.get('/calendar/upcoming')
  return unwrapResponse(response)
}
