import { useState } from 'react'

const ACTION_LABELS = {
  selected: ['Select', 'Selected ✓'],
  save: ['Save', 'Saved ✓'],
  helpful: ['Helpful', 'Helpful ✓'],
  not_interested: ['Not Interested', 'Not Interested'],
}

export default function FeedbackActions({ item, actions, contextType, onFeedback }) {
  const [pending, setPending] = useState('')
  const [complete, setComplete] = useState('')
  const [error, setError] = useState('')

  const submit = async (action) => {
    setPending(action)
    setError('')
    try {
      await onFeedback(item, action, contextType)
      setComplete(action)
    } catch (requestError) {
      setError(requestError?.message || 'Could not save this choice. Please try again.')
    } finally {
      setPending('')
    }
  }

  return (
    <div className="feedback-actions">
      <div className="inline-actions">
        {actions.map((action) => {
          const [label, successLabel] = ACTION_LABELS[action]
          return (
            <button
              className={`button button-ghost feedback-${action}`}
              disabled={Boolean(pending)}
              key={action}
              onClick={() => submit(action)}
              type="button"
            >
              {pending === action ? 'Updating…' : complete === action ? successLabel : label}
            </button>
          )
        })}
      </div>
      {error ? <p className="feedback-error" role="alert">{error}</p> : null}
    </div>
  )
}
