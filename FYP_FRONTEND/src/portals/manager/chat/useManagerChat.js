import { useCallback, useEffect, useRef, useState } from 'react'
import { connectChatSocket, managerChatApi } from '../../../services/manager/chatService.js'

// The API writes property names in camelCase except for the messages the chat server forwards (they use the C# names). Both are accepted.
function normalize(message) {
  return {
    messageId: message.messageId ?? message.MessageId,
    orgId: message.orgId ?? message.OrgId,
    senderType: message.senderType ?? message.SenderType,
    body: message.body ?? message.Body,
    createdAt: message.createdAt ?? message.CreatedAt,
    readAt: message.readAt ?? message.ReadAt ?? null,
  }
}

const byId = (list) => [...new Map(list.map((message) => [message.messageId, message])).values()].sort((a, b) => a.messageId - b.messageId)

/**
 * Live chat of an Organization Manager: the conversations (one per assigned organization), the opened conversation's messages,
 * and the connection to the chat server.
 */
export function useManagerChat() {
  const [conversations, setConversations] = useState(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState({}) // orgId -> [message]
  const [hasMore, setHasMore] = useState({}) // orgId -> bool
  const [connected, setConnected] = useState(false)
  const [connectProblem, setConnectProblem] = useState('')
  const socketRef = useRef(null)
  const selectedRef = useRef(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await managerChatApi.conversations())
      setError('')
    } catch (problem) {
      setError(problem.message)
    }
  }, [])

  const markRead = useCallback((orgId) => {
    socketRef.current?.emit('chat:read', { orgId }, () => {})
    setConversations((current) => current?.map((c) => (c.organizationId === orgId ? { ...c, unread: 0 } : c)) ?? current)
  }, [])

  useEffect(() => {
    const first = setTimeout(loadConversations, 0)
    const socket = connectChatSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setConnectProblem('')
      // Anything sent while the connection was down is picked up from the API.
      loadConversations()
      const open = selectedRef.current
      if (open != null) {
        managerChatApi.messages(open).then((list) => setMessages((current) => ({ ...current, [open]: byId([...(current[open] ?? []), ...list.map(normalize)]) })))
      }
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (problem) => {
      setConnected(false)
      const reason = problem?.data?.reason
      setConnectProblem(
        problem?.message !== 'unauthorized'
          ? 'The chat server is not reachable. Start it with "npm start" in the FYP_CHAT folder.'
          : reason === 'expired'
            ? 'Your session has expired. Sign out and sign in again.'
            : reason === 'no-cookie'
              ? 'Your sign-in did not reach the chat server. Open the portal at http://localhost:5173 and sign in again.'
              : reason === 'bad-signature'
                ? 'The chat server uses a different secret than the backend. In FYP_CHAT run "npm run init-env -- --force" and restart it.'
                : 'The chat server did not accept your sign-in. Sign out and sign in again.',
      )
    })

    socket.on('chat:message', (raw) => {
      const message = normalize(raw)
      const open = selectedRef.current === message.orgId
      setMessages((current) => (current[message.orgId] ? { ...current, [message.orgId]: byId([...current[message.orgId], message]) } : current))
      setConversations((current) =>
        current?.map((c) =>
          c.organizationId === message.orgId
            ? { ...c, lastMessage: message, unread: message.senderType === 'Organization' && !open ? c.unread + 1 : c.unread }
            : c,
        ),
      )
      // Re-order: the newest conversation first
      setConversations((current) => current && [...current].sort((a, b) => new Date(b.lastMessage?.createdAt ?? 0) - new Date(a.lastMessage?.createdAt ?? 0)))
      if (open && message.senderType === 'Organization') markRead(message.orgId)
    })

    // The organization opened the conversation: my messages are read.
    socket.on('chat:read', ({ orgId, by }) => {
      if (by !== 'Organization') return
      const now = new Date().toISOString()
      setMessages((current) =>
        current[orgId] ? { ...current, [orgId]: current[orgId].map((m) => (m.senderType === 'Manager' && !m.readAt ? { ...m, readAt: now } : m)) } : current,
      )
    })

    return () => {
      clearTimeout(first)
      socket.close()
    }
  }, [loadConversations, markRead])

  const select = useCallback(
    async (orgId) => {
      selectedRef.current = orgId
      setSelectedId(orgId)
      if (orgId == null) return
      markRead(orgId)
      if (messages[orgId]) return
      try {
        const page = (await managerChatApi.messages(orgId)).map(normalize)
        setMessages((current) => ({ ...current, [orgId]: byId([...(current[orgId] ?? []), ...page]) }))
        setHasMore((current) => ({ ...current, [orgId]: page.length >= 30 }))
      } catch (problem) {
        setError(problem.message)
      }
    },
    [markRead, messages],
  )

  const loadOlder = useCallback(async () => {
    const orgId = selectedRef.current
    const first = messages[orgId]?.[0]
    if (orgId == null || !first) return
    const page = (await managerChatApi.messages(orgId, first.messageId)).map(normalize)
    setMessages((current) => ({ ...current, [orgId]: byId([...page, ...(current[orgId] ?? [])]) }))
    setHasMore((current) => ({ ...current, [orgId]: page.length >= 30 }))
  }, [messages])

  /** Sends through the chat server. Resolves to an error text, or '' when it was sent. */
  const send = useCallback(
    (orgId, body) =>
      new Promise((resolve) => {
        const socket = socketRef.current
        if (!socket?.connected) {
          resolve('You are offline. Reconnecting...')
          return
        }
        socket.timeout(10000).emit('chat:send', { orgId, body }, (timeout, result) => {
          if (timeout) resolve('The message was not confirmed. Check your connection.')
          else if (!result?.ok) resolve(result?.error || 'The message could not be sent.')
          else resolve('')
        })
      }),
    [],
  )

  return { conversations, error, selectedId, messages, hasMore, connected, connectProblem, select, send, loadOlder, reload: loadConversations }
}
