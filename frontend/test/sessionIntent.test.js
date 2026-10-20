import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSessionPreferencePayload } from '../src/services/api/exerciseApi.js'

test('session preference payload trims and bounds temporary intent fields', () => {
  assert.deepEqual(buildSessionPreferencePayload({
    foodPreference: ' Chicken ',
    musicPreference: ' Rock ',
    preferenceNote: ' chicken and carbs ',
  }), {
    foodPreference: 'Chicken',
    musicPreference: 'Rock',
    preferenceNote: 'chicken and carbs',
  })
  assert.deepEqual(buildSessionPreferencePayload(), {
    foodPreference: '',
    musicPreference: '',
    preferenceNote: '',
  })
})
