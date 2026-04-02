import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import { normalizeApiError } from '../services/api/client'
import { fetchFriendsList } from '../services/api/friendsApi'
import { fetchChatMessages, sendChatMessage } from '../services/api/chatApi'

const MESSAGE_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'diet', label: 'Diet' },
  { value: 'workout', label: 'Workout' },
]

function formatTimestamp(value) {
  if (!value) {
    return ''
  }
  return new Date(value).toLocaleString()
}

export default function ChatPage() {
  const [friends, setFriends] = useState([])
  const [activeFriendId, setActiveFriendId] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoadingFriends, setIsLoadingFriends] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState({
    type: 'text',
    content: '',
  })

  useEffect(() => {
    const loadFriends = async () => {
      try {
        setIsLoadingFriends(true)
        const data = await fetchFriendsList()
        const rows = data.friends || []
        setFriends(rows)
        if (rows.length) {
          setActiveFriendId((current) => current || rows[0].id)
        }
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setIsLoadingFriends(false)
      }
    }
    loadFriends()
  }, [])

  const activeFriend = useMemo(
    () => friends.find((friend) => friend.id === activeFriendId) || null,
    [friends, activeFriendId]
  )

  const loadConversation = async (peerId) => {
    if (!peerId) {
      setMessages([])
      return
    }

    try {
      setIsLoadingMessages(true)
      const data = await fetchChatMessages(peerId, 180)
      setMessages(data.messages || [])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsLoadingMessages(false)
    }
  }

  useEffect(() => {
    loadConversation(activeFriendId)
  }, [activeFriendId])

  const handleSend = async () => {
    setError('')
    setStatus('')
    if (!activeFriendId) {
      setError('Select a friend to start chatting.')
      return
    }
    if (!String(draft.content || '').trim()) {
      setError('Message cannot be empty.')
      return
    }

    try {
      setIsSending(true)
      await sendChatMessage({
        receiverId: activeFriendId,
        content: draft.content,
        type: draft.type,
      })
      setDraft((prev) => ({ ...prev, content: '' }))
      setStatus('Message sent.')
      await loadConversation(activeFriendId)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>BFIT Chat</h1>
        <p className="muted">
          Chat with friends and share diet, recipe, and workout updates in one place.
        </p>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        {isLoadingFriends ? (
          <p className="muted">Loading friends...</p>
        ) : friends.length ? (
          <div className="split-two">
            <article className="sub-panel">
              <h2>Friends</h2>
              <div className="field">
                <span className="field-label">Active Chat</span>
                <select
                  className="field-control"
                  value={activeFriendId}
                  onChange={(event) => setActiveFriendId(event.target.value)}
                >
                  <option value="">Select friend</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.firstName} {friend.lastName} ({friend.email})
                    </option>
                  ))}
                </select>
              </div>

              <ul className="activity-list">
                {friends.map((friend) => (
                  <li key={friend.id} className="activity-item">
                    <p>
                      <strong>
                        {friend.firstName} {friend.lastName}
                      </strong>
                    </p>
                    <p className="muted">{friend.email}</p>
                  </li>
                ))}
              </ul>
            </article>

            <article className="sub-panel">
              <h2>{activeFriend ? `Conversation with ${activeFriend.firstName}` : 'Conversation'}</h2>
              {isLoadingMessages ? <p className="muted">Loading messages...</p> : null}
              {!isLoadingMessages && messages.length ? (
                <ul className="activity-list">
                  {messages.map((message) => (
                    <li key={message.id} className="activity-item">
                      <p>
                        <strong>{message.senderId === activeFriendId ? activeFriend?.firstName || 'Friend' : 'You'}</strong>{' '}
                        <span className="pill">{message.type}</span>
                      </p>
                      <p>{message.content}</p>
                      <p className="muted">{formatTimestamp(message.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!isLoadingMessages && !messages.length ? (
                <EmptyState
                  title="No messages yet"
                  description="Send your first message to start the conversation."
                />
              ) : null}

              <div className="form">
                <div className="split-two">
                  <label className="field">
                    <span className="field-label">Message Type</span>
                    <select
                      className="field-control"
                      value={draft.type}
                      onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                    >
                      {MESSAGE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Message</span>
                    <input
                      className="field-control"
                      type="text"
                      maxLength="1200"
                      value={draft.content}
                      placeholder="Share your recipe, workout, or daily progress..."
                      onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
                    />
                  </label>
                </div>
                <button className="button" type="button" onClick={handleSend} disabled={isSending}>
                  {isSending ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </article>
          </div>
        ) : (
          <EmptyState
            title="Add friends to chat"
            description="Open the Friends page, connect with users, then return to start chatting."
            actionLabel="Go to Friends"
            actionTo="/friends"
          />
        )}
      </article>
    </section>
  )
}
