import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { asManager, asOrganization, internalOrganizations } from './api.js'
import { authenticateCookie, MANAGER_ROLE } from './auth.js'
import { assertConfig, config } from './config.js'

assertConfig()

const here = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- rooms
// manager:{userId}          every open tab of one manager
// org:{orgId}:{userId}      the organization side of one conversation (organization + manager)
export const managerRoom = (userId) => `manager:${userId}`
export const orgRoom = (orgId, userId) => `org:${orgId}:${userId}`

function cleanBody(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length === 0 || text.length > config.maxBodyLength ? null : text
}

const asId = (value) => (Number.isInteger(value) && value > 0 ? value : null)

// ---------------------------------------------------------------- http (health + the optional test page)
const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')

  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
    return
  }

  if (config.devTools && url.pathname === '/dev') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(await readFile(resolve(here, '..', 'public', 'org-test.html')))
    return
  }

  if (config.devTools && url.pathname === '/dev/organizations') {
    try {
      const rows = await internalOrganizations()
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rows))
    } catch (error) {
      response.writeHead(error.status || 500, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ message: error.message }))
    }
    return
  }

  response.writeHead(404)
  response.end()
})

// ---------------------------------------------------------------- sockets
// Same origin through the Vite proxy in development, so no CORS is needed. The browser client is only served for the test page.
export const io = new Server(httpServer, { serveClient: config.devTools })

io.use((socket, next) => {
  const manager = authenticateCookie(socket.handshake.headers.cookie)
  if (manager.userId && manager.role.toLowerCase() === MANAGER_ROLE.toLowerCase()) {
    socket.data = { kind: 'manager', userId: manager.userId, token: manager.token, expiresAt: manager.expiresAt }
    return next()
  }

  // Test page only: speak as an organization (the organization portal and its login do not exist yet).
  const { devOrgId, devManagerUserId } = socket.handshake.auth ?? {}
  if (config.devTools && asId(devOrgId) && asId(devManagerUserId)) {
    socket.data = { kind: 'organization', orgId: devOrgId, userId: devManagerUserId }
    return next()
  }

  const reason = manager.reason ?? 'wrong-role'
  console.warn(`[chat] connection refused: ${reason}`)
  next(Object.assign(new Error('unauthorized'), { data: { reason } }))
})

/** Wraps an event so it always answers the client, refuses when the sign-in has expired, and limits flooding. */
function handler(socket, run) {
  const sent = []
  return async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}

    if (socket.data.kind === 'manager' && socket.data.expiresAt && Date.now() > socket.data.expiresAt) {
      reply({ ok: false, error: 'Your session has expired. Please sign in again.', code: 'expired' })
      socket.disconnect(true)
      return
    }

    const now = Date.now()
    while (sent.length > 0 && now - sent[0] > config.rateLimit.windowMs) sent.shift()
    if (sent.length >= config.rateLimit.messages) {
      reply({ ok: false, error: 'You are sending messages too fast. Wait a moment.' })
      return
    }
    sent.push(now)

    try {
      reply({ ok: true, ...(await run(payload ?? {})) })
    } catch (error) {
      reply({ ok: false, error: error.message || 'Something went wrong.' })
    }
  }
}

io.on('connection', (socket) => {
  const { kind, userId } = socket.data

  if (kind === 'manager') {
    socket.join(managerRoom(userId))
  } else {
    socket.join(orgRoom(socket.data.orgId, userId))
  }

  // A message. Saved by the API first; only a saved message is delivered to the other side.
  socket.on(
    'chat:send',
    handler(socket, async ({ orgId, body }) => {
      const text = cleanBody(body)
      if (!text) throw new Error(`Write a message of up to ${config.maxBodyLength} characters.`)

      if (kind === 'manager') {
        if (!asId(orgId)) throw new Error('Choose an organization.')
        const message = await asManager(socket.data.token).send(orgId, text)
        io.to(managerRoom(userId)).to(orgRoom(orgId, userId)).emit('chat:message', message)
        return { message }
      }

      const message = await asOrganization(socket.data.orgId, userId).send(text)
      io.to(managerRoom(userId)).to(orgRoom(socket.data.orgId, userId)).emit('chat:message', message)
      return { message }
    }),
  )

  // The conversation was opened: the other side's messages become read, and they are told (blue ticks).
  socket.on(
    'chat:read',
    handler(socket, async ({ orgId }) => {
      if (kind === 'manager') {
        if (!asId(orgId)) throw new Error('Choose an organization.')
        const { marked } = await asManager(socket.data.token).markRead(orgId)
        if (marked > 0) io.to(orgRoom(orgId, userId)).emit('chat:read', { orgId, by: 'Manager' })
        return { marked }
      }

      const { marked } = await asOrganization(socket.data.orgId, userId).markRead()
      if (marked > 0) io.to(managerRoom(userId)).emit('chat:read', { orgId: socket.data.orgId, by: 'Organization' })
      return { marked }
    }),
  )

  // Organization side (test page): load the history.
  socket.on(
    'chat:history',
    handler(socket, async ({ before }) => {
      if (kind !== 'organization') throw new Error('Not available.')
      return { messages: await asOrganization(socket.data.orgId, userId).history(before) }
    }),
  )

  socket.emit('chat:ready', { kind })
})

httpServer.listen(config.port, () => {
  console.log(`Chat server listening on http://localhost:${config.port}${config.devTools ? '  (dev tools ON: /dev)' : ''}`)
})
