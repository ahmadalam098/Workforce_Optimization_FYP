import { io } from 'socket.io-client'
import { apiRequest } from '../apiClient.js'

// History and unread counts come from the ASP.NET API; live delivery comes from the Node.js chat server (FYP_CHAT) through
// the same origin ("/socket.io" is proxied in development), so the HttpOnly sign-in cookie is sent with the connection.

export const managerChatApi = {
  /** [{ organizationId, name, status, unread, lastMessage: { messageId, senderType, body, createdAt, readAt } | null }] */
  conversations: (signal) => apiRequest('/api/manager/chat/conversations', { signal }),
  /** Oldest first. `before` (a message id) loads the older page. -> [{ messageId, orgId, managerUserId, senderType, body, createdAt, readAt }] */
  messages: (orgId, before, signal) =>
    apiRequest(`/api/manager/chat/conversations/${orgId}/messages`, { params: { before, limit: 30 }, signal }),
}

/** Opens the live connection. Events: chat:ready, chat:message, chat:read. Send with socket.emit('chat:send', { orgId, body }, ack). */
export function connectChatSocket() {
  return io({ transports: ['websocket', 'polling'], withCredentials: true, reconnectionDelayMax: 5000 })
}
