import { useCallback, useEffect, useRef, useState } from 'react'
import { organizationChatApi } from '../../../services/organization/organizationService.js'
import { connectChatSocket } from '../../../services/manager/chatService.js'

// The API writes property names in camelCase except for the messages the chat server forwards (they use the C# names). Both are accepted.
function normalize(message) {
  return {
    messageId: message.messageId ?? message.MessageId,
    managerUserId: message.managerUserId ?? message.ManagerUserId,
    senderType: message.senderType ?? message.SenderType,
    body: message.body ?? message.Body,
    createdAt: message.createdAt ?? message.CreatedAt,
    readAt: message.readAt ?? message.ReadAt ?? null,
  }
}

const byId = (list) => [...new Map(list.map((message) => [message.messageId, message])).values()].sort((a, b) => a.messageId - b.messageId)

/** Live chat of an Organization: one conversation per manager linked to it (id = the manager's user id), and the connection to the chat server. */
export function useOrganizationChat() {
  const [conversations, setConversations] = useState(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState({}) // managerUserId -> [message]
  const [hasMore, setHasMore] = useState({})
  const [connected, setConnected] = useState(false)
  const [connectProblem, setConnectProblem] = useState('')
  const socketRef = useRef(null)
  const selectedRef = useRef(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  const loadConversations = useCallback(async () => {
    try {
      setConversations((await organizationChatApi.conversations()).map((c) => ({ ...c, id: c.managerUserId })))
      setError('')
    } catch (problem) {
      setError(problem.message)
    }
  }, [])

  const markRead = useCallback((managerUserId) => {
    socketRef.current?.emit('chat:read', { managerUserId }, () => {})
    setConversations((current) => current?.map((c) => (c.id === managerUserId ? { ...c, unread: 0 } : c)) ?? current)
  }, [])

  useEffect(() => {
    const first = setTimeout(loadConversations, 0)
    const socket = connectChatSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setConnectProblem('')
      loadConversations()
      const open = selectedRef.current
      if (open != null) {
        organizationChatApi.messages(open).then((list) => setMessages((current) => ({ ...current, [open]: byId([...(current[open] ?? []), ...list.map(normalize)]) })))
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
            : 'The chat server did not accept your sign-in. Sign out and sign in again.',
      )
    })

    socket.on('chat:message', (raw) => {
      const message = normalize(raw)
      const open = selectedRef.current === message.managerUserId
      setMessages((current) => (current[message.managerUserId] ? { ...current, [message.managerUserId]: byId([...current[message.managerUserId], message]) } : current))
      setConversations(
        (current) =>
          current &&
          current
            .map((c) => (c.id === message.managerUserId ? { ...c, lastMessage: message, unread: message.senderType === 'Manager' && !open ? c.unread + 1 : c.unread } : c))
            .sort((a, b) => new Date(b.lastMessage?.createdAt ?? 0) - new Date(a.lastMessage?.createdAt ?? 0)),
      )
      if (open && message.senderType === 'Manager') markRead(message.managerUserId)
    })

    // The manager opened the conversation: my messages are read.
    socket.on('chat:read', ({ managerUserId, by }) => {
      if (by !== 'Manager') return
      const now = new Date().toISOString()
      setMessages((current) =>
        current[managerUserId] ? { ...current, [managerUserId]: current[managerUserId].map((m) => (m.senderType === 'Organization' && !m.readAt ? { ...m, readAt: now } : m)) } : current,
      )
    })

    return () => {
      clearTimeout(first)
      socket.close()
    }
  }, [loadConversations, markRead])

  const select = useCallback(
    async (managerUserId) => {
      selectedRef.current = managerUserId
      setSelectedId(managerUserId)
      if (managerUserId == null) return
      markRead(managerUserId)
      if (messages[managerUserId]) return
      try {
        const page = (await organizationChatApi.messages(managerUserId)).map(normalize)
        setMessages((current) => ({ ...current, [managerUserId]: byId([...(current[managerUserId] ?? []), ...page]) }))
        setHasMore((current) => ({ ...current, [managerUserId]: page.length >= 30 }))
      } catch (problem) {
        setError(problem.message)
      }
    },
    [markRead, messages],
  )

  const loadOlder = useCallback(async () => {
    const id = selectedRef.current
    const first = messages[id]?.[0]
    if (id == null || !first) return
    const page = (await organizationChatApi.messages(id, first.messageId)).map(normalize)
    setMessages((current) => ({ ...current, [id]: byId([...page, ...(current[id] ?? [])]) }))
    setHasMore((current) => ({ ...current, [id]: page.length >= 30 }))
  }, [messages])

  /** Sends through the chat server. Resolves to an error text, or '' when it was sent. */
  const send = useCallback(
    (managerUserId, body) =>
      new Promise((resolve) => {
        const socket = socketRef.current
        if (!socket?.connected) {
          resolve('You are offline. Reconnecting...')
          return
        }
        socket.timeout(10000).emit('chat:send', { managerUserId, body }, (timeout, result) => {
          if (timeout) resolve('The message was not confirmed. Check your connection.')
          else if (!result?.ok) resolve(result?.error || 'The message could not be sent.')
          else resolve('')
        })
      }),
    [],
  )

  return { conversations, error, selectedId, messages, hasMore, connected, connectProblem, select, send, loadOlder, reload: loadConversations }
}
