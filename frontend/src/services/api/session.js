import { removeLocalItem } from '../../utils/storage.js'

export const SESSION_INVALIDATED_EVENT = 'recommendation:session-invalidated'

let redirectStarted = false

export function invalidateSession() {
  removeLocalItem('recommendation_model_token')
  removeLocalItem('recommendation_model_user')

  if (typeof window === 'undefined') return

  window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT))
  if (/^\/login(?:\/|$)/.test(window.location.pathname) || redirectStarted) return

  redirectStarted = true
  window.location.replace('/login?sessionExpired=1')
}

export function isPublicAuthRequest(url = '') {
  return /^\/api\/auth\/(login|register|verify-email|forgot-password|reset-password)(?:\/|\?|$)/i.test(url)
}
