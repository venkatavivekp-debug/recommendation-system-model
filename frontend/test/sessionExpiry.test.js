import assert from 'node:assert/strict'
import test from 'node:test'
import apiClient from '../src/services/api/client.js'
import { SESSION_INVALIDATED_EVENT } from '../src/services/api/session.js'

test('authenticated requests keep valid sessions and only a 401 clears and redirects', async () => {
  const values = new Map([
    ['recommendation_model_token', 'stored-token'],
    ['recommendation_model_user', '{"id":"user-1"}'],
  ])
  const events = new EventTarget()
  const redirects = []
  let invalidatedEvents = 0
  events.addEventListener(SESSION_INVALIDATED_EVENT, () => { invalidatedEvents += 1 })
  globalThis.window = Object.assign(events, {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      removeItem: (key) => values.delete(key),
    },
    location: {
      pathname: '/results',
      replace: (path) => redirects.push(path),
    },
  })

  apiClient.defaults.adapter = async (config) => {
    const status = Number(config.headers['x-test-status'] || 200)
    const response = { config, status, data: {}, headers: {} }
    if (status >= 400) {
      throw Object.assign(new Error(`HTTP ${status}`), { config, response })
    }
    return response
  }

  try {
    const valid = await apiClient.get('/dashboard')
    assert.equal(valid.status, 200)
    assert.equal(values.get('recommendation_model_token'), 'stored-token')

    for (const status of [400, 403, 404, 500]) {
      await assert.rejects(apiClient.get('/dashboard', { headers: { 'x-test-status': status } }))
      assert.equal(values.get('recommendation_model_token'), 'stored-token')
      assert.equal(redirects.length, 0)
    }

    window.location.pathname = '/login'
    await assert.rejects(apiClient.get('/dashboard', { headers: { 'x-test-status': 401 } }))
    assert.equal(values.has('recommendation_model_token'), false)
    assert.equal(redirects.length, 0)
    values.set('recommendation_model_token', 'stored-token')
    values.set('recommendation_model_user', '{"id":"user-1"}')
    window.location.pathname = '/results'

    await assert.rejects(apiClient.get('/dashboard', { headers: { 'x-test-status': 401 } }))
    assert.equal(values.has('recommendation_model_token'), false)
    assert.equal(values.has('recommendation_model_user'), false)
    assert.equal(invalidatedEvents, 2)
    assert.deepEqual(redirects, ['/login?sessionExpired=1'])
  } finally {
    delete globalThis.window
    delete apiClient.defaults.adapter
  }
})

test('401 from a public login request does not invalidate an existing session', async () => {
  const values = new Map([['recommendation_model_token', 'stored-token']])
  const redirects = []
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      removeItem: (key) => values.delete(key),
    },
    location: { pathname: '/login', replace: (path) => redirects.push(path) },
  })
  apiClient.defaults.adapter = async (config) => {
    const response = { config, status: 401, data: {}, headers: {} }
    throw Object.assign(new Error('Unauthorized'), { config, response })
  }

  try {
    await assert.rejects(apiClient.post('/auth/login', { email: 'x@example.com', password: 'bad' }))
    assert.equal(values.get('recommendation_model_token'), 'stored-token')
    assert.deepEqual(redirects, [])
  } finally {
    delete globalThis.window
    delete apiClient.defaults.adapter
  }
})
