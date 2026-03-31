import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import { normalizeApiError } from '../services/api/client'
import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriendsList,
  rejectFriendRequest,
  searchFriendUsers,
  sendFriendRequest,
} from '../services/api/friendsApi'

export default function FriendsPage() {
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = async () => {
    const [friendList, requestData] = await Promise.all([fetchFriendsList(), fetchFriendRequests()])
    setFriends(friendList.friends || [])
    setIncoming((requestData.incoming || []).filter((item) => item.status === 'PENDING'))
    setOutgoing((requestData.outgoing || []).filter((item) => item.status === 'PENDING'))
  }

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        await loadData()
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const handleSearch = async () => {
    setError('')
    setStatus('')
    try {
      const data = await searchFriendUsers(searchEmail)
      setSearchResults(data.users || [])
      if (!(data.users || []).length) {
        setStatus('No users found for this email query.')
      }
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleSend = async (user) => {
    setError('')
    setStatus('')
    try {
      await sendFriendRequest({ receiverId: user.id })
      setStatus(`Friend request sent to ${user.firstName}.`)
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleAccept = async (requestId) => {
    setError('')
    setStatus('')
    try {
      await acceptFriendRequest(requestId)
      setStatus('Friend request accepted.')
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleReject = async (requestId) => {
    setError('')
    setStatus('')
    try {
      await rejectFriendRequest(requestId)
      setStatus('Friend request rejected.')
      await loadData()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>BFIT Friends</h1>
        <p className="muted">Find users by email, send requests, and manage your friend network.</p>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        <article className="sub-panel">
          <h2>Add Friend</h2>
          <div className="split-two">
            <FieldInput
              label="Search by email"
              type="text"
              placeholder="friend@example.com"
              value={searchEmail}
              onChange={(event) => setSearchEmail(event.target.value)}
            />
            <button className="button button-align-end" type="button" onClick={handleSearch}>
              Search User
            </button>
          </div>
          {searchResults.length ? (
            <ul className="activity-list">
              {searchResults.map((user) => (
                <li key={user.id} className="activity-item">
                  <p>
                    <strong>
                      {user.firstName} {user.lastName}
                    </strong>
                  </p>
                  <p className="muted">{user.email}</p>
                  <button className="button button-ghost" onClick={() => handleSend(user)}>
                    Send Request
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <div className="split-two">
          <article className="sub-panel">
            <h2>Pending Incoming Requests</h2>
            {loading ? <p className="muted">Loading requests...</p> : null}
            {!loading && incoming.length ? (
              <ul className="activity-list">
                {incoming.map((request) => (
                  <li key={request.id} className="activity-item">
                    <p>
                      <strong>
                        {request.sender?.firstName} {request.sender?.lastName}
                      </strong>
                    </p>
                    <p className="muted">{request.sender?.email}</p>
                    <div className="inline-actions">
                      <button className="button button-ghost" onClick={() => handleAccept(request.id)}>
                        Accept
                      </button>
                      <button className="button button-ghost" onClick={() => handleReject(request.id)}>
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {!loading && !incoming.length ? (
              <EmptyState title="No incoming requests" description="New friend requests will appear here." />
            ) : null}
          </article>

          <article className="sub-panel">
            <h2>Outgoing Requests</h2>
            {!loading && outgoing.length ? (
              <ul className="activity-list">
                {outgoing.map((request) => (
                  <li key={request.id} className="activity-item">
                    <p>
                      <strong>
                        {request.receiver?.firstName} {request.receiver?.lastName}
                      </strong>
                    </p>
                    <p className="muted">{request.receiver?.email}</p>
                    <p className="muted">Pending</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {!loading && !outgoing.length ? (
              <EmptyState title="No outgoing requests" description="Requests you send will appear here." />
            ) : null}
          </article>
        </div>

        <article className="sub-panel">
          <h2>Friends List</h2>
          {friends.length ? (
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
          ) : (
            <EmptyState title="No friends added yet" description="Search by email and send your first friend request." />
          )}
        </article>
      </article>
    </section>
  )
}
