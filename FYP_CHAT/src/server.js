import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { asManager, asOrganization, asSignedInOrganization, internalOrganizations } from './api.js'
import { authenticateCookie, MANAGER_ROLE, ORGANIZATION_ROLE } from './auth.js'
import { assertConfig, config } from './config.js'
import { createCalls, employeeRoom } from './calls.js'

assertConfig()

const here = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- rooms
// manager:{userId}          every open tab of one manager
// org:{orgId}               every open tab of one organization (all of its managers' conversations)
export const managerRoom = (userId) => `manager:${userId}`
export const orgRoom = (orgId) => `org:${orgId}`
export { employeeRoom }

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

  // An employee (calls only: no chat with organizations).
  if (manager.userId && manager.role.toLowerCase() === 'employee') {
    socket.data = { kind: 'employee', userId: manager.userId, token: manager.token, expiresAt: manager.expiresAt }
    return next()
  }

  // A signed-in organization: it can only talk to the managers linked to it (the API checks that on every message).
  if (manager.orgId && manager.role.toLowerCase() === ORGANIZATION_ROLE.toLowerCase()) {
    socket.data = { kind: 'organization', orgId: manager.orgId, token: manager.token, expiresAt: manager.expiresAt }
    return next()
  }

  // Test page only: speak as an organization without signing in.
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

    if (socket.data.token && socket.data.expiresAt && Date.now() > socket.data.expiresAt) {
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

const calls = createCalls(io, { managerRoom, orgRoom })

io.on('connection', (socket) => {
  const { kind, userId } = socket.data

  if (kind === 'manager') {
    socket.join(managerRoom(userId))
  } else if (kind === 'employee') {
    socket.join(employeeRoom(userId))
  } else {
    socket.join(orgRoom(socket.data.orgId))
  }

  // Audio / video calls and who is online (only for signed-in people).
  calls.attach(socket, handler)

  // A message. Saved by the API first; only a saved message is delivered to the other side.
  socket.on(
    'chat:send',
    handler(socket, async ({ orgId, managerUserId, body }) => {
      const text = cleanBody(body)
      if (!text) throw new Error(`Write a message of up to ${config.maxBodyLength} characters.`)

      if (kind === 'manager') {
        if (!asId(orgId)) throw new Error('Choose an organization.')
        const message = await asManager(socket.data.token).send(orgId, text)
        io.to(managerRoom(userId)).to(orgRoom(orgId)).emit('chat:message', message)
        return { message }
      }

      // A signed-in organization chooses the manager; the test page speaks to the one it was opened for.
      const toManager = socket.data.token ? asId(managerUserId) : userId
      if (!toManager) throw new Error('Choose a manager.')
      if (kind !== 'organization') throw new Error('Not available.')
      const message = socket.data.token ? await asSignedInOrganization(socket.data.token).send(toManager, text) : await asOrganization(socket.data.orgId, toManager).send(text)
      io.to(managerRoom(toManager)).to(orgRoom(socket.data.orgId)).emit('chat:message', message)
      return { message }
    }),
  )

  // The conversation was opened: the other side's messages become read, and they are told (blue ticks).
  socket.on(
    'chat:read',
    handler(socket, async ({ orgId, managerUserId }) => {
      if (kind === 'manager') {
        if (!asId(orgId)) throw new Error('Choose an organization.')
        const { marked } = await asManager(socket.data.token).markRead(orgId)
        if (marked > 0) io.to(orgRoom(orgId)).emit('chat:read', { orgId, managerUserId: userId, by: 'Manager' })
        return { marked }
      }

      if (kind !== 'organization') throw new Error('Not available.')
      const toManager = socket.data.token ? asId(managerUserId) : userId
      if (!toManager) throw new Error('Choose a manager.')
      const { marked } = socket.data.token ? await asSignedInOrganization(socket.data.token).markRead(toManager) : await asOrganization(socket.data.orgId, toManager).markRead()
      if (marked > 0) io.to(managerRoom(toManager)).emit('chat:read', { orgId: socket.data.orgId, by: 'Organization' })
      return { marked }
    }),
  )

  // Organization side (test page): load the history.
  socket.on(
    'chat:history',
    handler(socket, async ({ before }) => {
      if (kind !== 'organization') throw new Error('Not available.')
      if (socket.data.token) throw new Error('Not available.')
      return { messages: await asOrganization(socket.data.orgId, userId).history(before) }
    }),
  )

  socket.emit('chat:ready', { kind })
})

httpServer.listen(config.port, () => {
  console.log(`Chat server listening on http://localhost:${config.port}${config.devTools ? '  (dev tools ON: /dev)' : ''}`)
})
