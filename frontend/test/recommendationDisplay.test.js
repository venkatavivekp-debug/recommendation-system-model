import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptationMessage, policyScoreSummary } from '../src/utils/recommendationDisplay.js'

test('policy explanation displays actual signed components without matrices or invented scores', () => {
  assert.equal(policyScoreSummary({ baseScore: 0.6, adaptivePolicyContribution: -0.12, explorationBonus: 0.04 }), 'Base 60.0; learned preference -12.0; exploration +4.0')
  assert.equal(policyScoreSummary({ baseScore: NaN }), '')
  assert.equal(policyScoreSummary(null), '')
})

test('adaptation message reports only rank changes found in the returned lists', () => {
  const item = { id: 'meal-1', foodName: 'Chicken Grain Bowl' }

  assert.equal(
    adaptationMessage(item, 'selected', [{ id: 'meal-2' }, item], [item, { id: 'meal-2' }]),
    'Chicken Grain Bowl moved #2 → #1 after your selection.'
  )
  assert.equal(adaptationMessage(item, 'save', [item], [item]), 'Preference saved for future recommendations.')
  assert.equal(adaptationMessage(item, 'not_interested', [item], [{ id: 'meal-2' }]), 'Chicken Grain Bowl was removed after Not Interested.')
  assert.equal(adaptationMessage(item, 'not_interested', [], []), 'Preference saved for future recommendations.')
  assert.equal(adaptationMessage(item, 'selected', [{ ...item, id: 'other' }], [item]), 'Chicken Grain Bowl entered the list at #1.')
})
