// End-to-end test of the chat server with a fake ASP.NET API (no database, no internet needed).
// Run: npm test
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { io as connect } from 'socket.io-client'

const here = dirname(fileURLToPath(import.meta.url))
const KEY = 'a-test-key-that-is-long-enough-for-hmac-sha256-1234567890'
const SERVICE_KEY = 'test-service-key'
const ISSUER = 'test-issuer'
const AUDIENCE = 'test-audience'
const API_PORT = 4990
const CHAT_PORT = 4991
const CHAT_PORT_NO_DEV = 4992

let failures = 0
const check = (ok, name, detail) => {
  if (ok) console.log(`PASS ${name}`)
  else {
    failures += 1
    console.log(`FAIL ${name} ${detail ?? ''}`)
  }
}

// ---------------------------------------------------------------- fake ASP.NET API
const CALLS = new Map()
let nextCall = 1
const CUTTABLE_BY = [2] // manager 2 may cut the test calls
const partyOfCookie = (cookie) => {
  const t = (cookie || '').match(/accessToken=([^;]+)/)?.[1]
  const p = t ? jwt.decode(t) : null
  if (!p) return null
  const role = p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
  if (role === 'Organization') return { type: 'Organization', id: Number(p.org_id) }
  return { type: role === 'Employee' ? 'Employee' : 'Manager', id: Number(p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']) }
}
const newCall = (caller, callee, media = 'video') => {
  const call = { callId: nextCall++, media, status: 'Ringing', caller: { ...caller }, callee: { ...callee } }
  CALLS.set(call.callId, call)
  return call
}
const ASSIGNED = { 2: [1, 2] } // manager 2 handles organizations 1 and 2
let nextId = 1
const apiCalls = []

const api = createServer((request, response) => {
  let raw = ''
  request.on('data', (chunk) => (raw += chunk))
  request.on('end', () => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    apiCalls.push({ method: request.method, url: request.url, cookie: request.headers.cookie, key: request.headers['x-chat-key'] })
    const body = raw ? JSON.parse(raw) : {}

    // ---- calls (fake): the API decides, the chat server only carries
    const callMatch = request.url.match(/^\/api\/(?:manager\/|internal\/)?calls\/(\d+)(?:\/(answer|end|cut|missed))?/)
    if (callMatch) {
      const call = CALLS.get(Number(callMatch[1]))
      const who = partyOfCookie(request.headers.cookie)
      if (!call) return send(404, { message: 'Call not found.' })
      const is = (p, x) => p && p.type === x.type && p.id === x.id
      const action = callMatch[2]
      if (action === 'missed') {
        if (request.headers['x-chat-key'] !== SERVICE_KEY) return send(401, {})
        if (call.status === 'Ringing') call.status = 'Missed'
        return send(200, call)
      }
      if (!who) return send(401, {})
      if (!action) return is(who, call.caller) || is(who, call.callee) ? send(200, call) : send(404, { message: 'Call not found.' })
      if (action === 'answer') {
        if (!is(who, call.callee) || call.status !== 'Ringing') return send(404, { message: 'Call not found.' })
        call.status = request.url.includes('accept=true') ? 'Active' : 'Declined'
        return send(200, call)
      }
      if (action === 'end') {
        if (!is(who, call.caller) && !is(who, call.callee)) return send(404, { message: 'Call not found.' })
        if (call.status !== 'Ringing' && call.status !== 'Active') return send(409, { message: 'This call has already ended.' })
        call.status = call.status === 'Active' ? 'Ended' : 'Cancelled'
        return send(200, call)
      }
      if (action === 'cut') {
        if (who.type !== 'Manager' || !CUTTABLE_BY.includes(who.id)) return send(404, { message: 'Call not found.' })
        call.status = 'Cut'
        call.endReason = body.reason
        return send(200, call)
      }
    }

    let match = request.url.match(/^\/api\/manager\/chat\/conversations\/(\d+)\/(messages|read)$/)
    if (match) {
      const orgId = Number(match[1])
      const token = (request.headers.cookie || '').match(/accessToken=([^;]+)/)?.[1]
      const userId = token ? Number(jwt.decode(token)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']) : null
      if (!userId) return send(401, { message: 'Not signed in.' })
      if (!(ASSIGNED[userId] || []).includes(orgId)) return send(403, { message: 'This organization is not assigned to you.' })
      if (match[2] === 'read') return send(200, { marked: 1 })
      return send(200, { MessageId: nextId++, OrgId: orgId, ManagerUserId: userId, SenderType: 'Manager', Body: body.body, CreatedAt: new Date().toISOString(), ReadAt: null })
    }

    match = request.url.match(/^\/api\/internal\/chat\/organizations\/(\d+)\/managers\/(\d+)\/(messages|read)/)
    if (match) {
      if (request.headers['x-chat-key'] !== SERVICE_KEY) return send(401, { message: 'Invalid chat service key.' })
      const orgId = Number(match[1])
      const managerId = Number(match[2])
      if (!(ASSIGNED[managerId] || []).includes(orgId)) return send(403, { message: 'This manager is not assigned to the organization.' })
      if (match[3] === 'read') return send(200, { marked: 1 })
      if (request.method === 'GET') return send(200, [])
      return send(200, { MessageId: nextId++, OrgId: orgId, ManagerUserId: managerId, SenderType: 'Organization', Body: body.body, CreatedAt: new Date().toISOString(), ReadAt: null })
    }

    match = request.url.match(/^\/api\/organization\/chat\/conversations\/(\d+)\/(messages|read)$/)
    if (match) {
      const managerId = Number(match[1])
      const token = (request.headers.cookie || '').match(/accessToken=([^;]+)/)?.[1]
      const orgId = token ? Number(jwt.decode(token).org_id) : null
      if (!orgId) return send(401, { message: 'Not signed in.' })
      if (!(ASSIGNED[managerId] || []).includes(orgId)) return send(403, { message: 'This manager is not linked to your organization.' })
      if (match[2] === 'read') return send(200, { marked: 1 })
      return send(200, { MessageId: nextId++, OrgId: orgId, ManagerUserId: managerId, SenderType: 'Organization', Body: body.body, CreatedAt: new Date().toISOString(), ReadAt: null })
    }

    if (request.url === '/api/internal/chat/organizations') return send(200, [{ organizationId: 1, name: 'Org One', managerUserId: 2, managerName: 'Sara' }])
    send(404, {})
  })
})
await new Promise((done) => api.listen(API_PORT, done))

// ---------------------------------------------------------------- chat servers
function startChat(port, devTools) {
  const child = spawn(process.execPath, [resolve(here, '..', 'src', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      JWT_KEY: KEY,
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      API_BASE_URL: `http://localhost:${API_PORT}`,
      CHAT_SERVICE_KEY: SERVICE_KEY,
      CHAT_DEV_TOOLS: String(devTools),
      CALL_RING_MS: '700',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((done, fail) => {
    child.stdout.on('data', (data) => String(data).includes('listening') && done(child))
    child.on('exit', (code) => fail(new Error(`chat server exited with ${code}`)))
  })
}
const chat = await startChat(CHAT_PORT, true)
const chatNoDev = await startChat(CHAT_PORT_NO_DEV, false)

// ---------------------------------------------------------------- helpers
const token = (userId, role = 'Organization Manager', { exp } = {}) =>
  jwt.sign(
    {
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': String(userId),
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': role,
      exp: exp ?? Math.floor(Date.now() / 1000) + 1800,
    },
    KEY,
    { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE },
  )

const open = (port, options) =>
  new Promise((done) => {
    const socket = connect(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false, ...options })
    socket.on('chat:ready', () => done({ socket, ok: true }))
    socket.on('connect_error', (error) => done({ socket, ok: false, error: error.message }))
  })

const managerSocket = (userId = 2, role) => open(CHAT_PORT, { extraHeaders: { Cookie: `accessToken=${token(userId, role)}` } })
const orgToken = (orgId) =>
  jwt.sign(
    { 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': `org-${orgId}`, org_id: String(orgId), 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Organization', exp: Math.floor(Date.now() / 1000) + 1800 },
    KEY,
    { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE },
  )
const signedInOrg = (orgId) => open(CHAT_PORT, { extraHeaders: { Cookie: `accessToken=${orgToken(orgId)}` } })
const orgSocket = (orgId, managerUserId, port = CHAT_PORT) => open(port, { auth: { devOrgId: orgId, devManagerUserId: managerUserId } })
const emit = (socket, event, payload) => new Promise((done) => socket.emit(event, payload, done))
const next = (socket, event, ms = 1500) =>
  new Promise((done) => {
    const timer = setTimeout(() => done(null), ms)
    socket.once(event, (data) => {
      clearTimeout(timer)
      done(data)
    })
  })

try {
  // ---- who may connect
  const noCookie = await open(CHAT_PORT, {})
  check(!noCookie.ok && noCookie.error === 'unauthorized', 'A1 no sign-in cookie: refused')
  const admin = await managerSocket(2, 'Admin')
  check(!admin.ok, 'A2 an Admin token cannot use the manager chat')
  const wrongKey = await open(CHAT_PORT, { extraHeaders: { Cookie: `accessToken=${jwt.sign({ nameid: '2', role: 'Organization Manager' }, 'another-secret-another-secret-123456', { issuer: ISSUER, audience: AUDIENCE })}` } })
  check(!wrongKey.ok, 'A3 a token signed with another key is refused')
  const expired = await open(CHAT_PORT, { extraHeaders: { Cookie: `accessToken=${token(2, 'Organization Manager', { exp: Math.floor(Date.now() / 1000) - 60 })}` } })
  check(!expired.ok, 'A4 an expired token is refused')
  const noDev = await orgSocket(1, 2, CHAT_PORT_NO_DEV)
  check(!noDev.ok, 'A5 organization test sockets are refused when dev tools are off')
  ;[noCookie, admin, wrongKey, expired, noDev].forEach((c) => c.socket.close())

  // ---- a conversation
  const m1 = await managerSocket(2)
  const m1b = await managerSocket(2) // a second browser tab of the same manager
  const org = await orgSocket(1, 2)
  check(m1.ok && m1b.ok && org.ok, 'B1 manager (two tabs) and organization connect')

  const pendingTab2 = next(m1b.socket, 'chat:message')
  const pendingOrg = next(org.socket, 'chat:message')
  const sent = await emit(m1.socket, 'chat:send', { orgId: 1, body: '  Hello from the manager  ' })
  check(sent.ok && sent.message.Body === 'Hello from the manager' && sent.message.SenderType === 'Manager', 'B2 manager sends; the saved message comes back trimmed', JSON.stringify(sent))
  const seenByTab2 = await pendingTab2
  const seenByOrg = await pendingOrg
  check(seenByTab2?.Body === 'Hello from the manager', 'B3 the manager\'s other tab receives it live')
  check(seenByOrg?.Body === 'Hello from the manager', 'B4 the organization receives it live')
  check(apiCalls.some((c) => c.url.includes('/messages') && c.cookie?.includes('accessToken=')), 'B5 the manager\'s own cookie was forwarded to the API')

  const pendingReply = next(m1.socket, 'chat:message')
  const reply = await emit(org.socket, 'chat:send', { body: 'We need two more agents' })
  check(reply.ok && reply.message.SenderType === 'Organization', 'B6 organization replies', JSON.stringify(reply))
  check((await pendingReply)?.Body === 'We need two more agents', 'B7 the manager receives the reply live')
  check(apiCalls.some((c) => c.key === SERVICE_KEY), 'B8 the organization side used the service key')

  // ---- read receipts
  const pendingRead = next(org.socket, 'chat:read')
  const read = await emit(m1.socket, 'chat:read', { orgId: 1 })
  check(read.ok && read.marked === 1, 'C1 manager opens the conversation', JSON.stringify(read))
  const readEvent = await pendingRead
  check(readEvent?.by === 'Manager' && readEvent.orgId === 1, 'C2 the organization is told the messages were read')

  // ---- rules
  const empty = await emit(m1.socket, 'chat:send', { orgId: 1, body: '   ' })
  check(!empty.ok, 'D1 an empty message is refused')
  const tooLong = await emit(m1.socket, 'chat:send', { orgId: 1, body: 'x'.repeat(2001) })
  check(!tooLong.ok, 'D2 a message over 2000 characters is refused')
  const foreign = await emit(m1.socket, 'chat:send', { orgId: 3, body: 'hi' })
  check(!foreign.ok && foreign.error.includes('not assigned'), 'D3 an organization that is not assigned is refused by the API', JSON.stringify(foreign))
  const noOrg = await emit(m1.socket, 'chat:send', { body: 'hi' })
  check(!noOrg.ok, 'D4 no organization chosen')
  const strange = await emit(m1.socket, 'chat:send', { orgId: '1; DROP', body: 'hi' })
  check(!strange.ok, 'D5 an organization id that is not a number is refused')
  const otherOrg = await orgSocket(2, 2)
  const leaked = next(otherOrg.socket, 'chat:message', 500)
  await emit(m1.socket, 'chat:send', { orgId: 1, body: 'private to org one' })
  check((await leaked) === null, 'D6 another organization does not receive the message')
  otherOrg.socket.close()

  // ---- a signed-in organization (no test page)
  const mgr = await managerSocket(2)
  const org1 = await signedInOrg(1)
  check(org1.ok, 'F1 a signed-in organization can connect')
  const liveAtManager = next(mgr.socket, 'chat:message')
  const sentByOrg = await emit(org1.socket, 'chat:send', { managerUserId: 2, body: 'hello manager' })
  check(sentByOrg.ok && (await liveAtManager)?.Body === 'hello manager', 'F2 the manager receives the organization message live')
  const liveAtOrg = next(org1.socket, 'chat:message')
  await emit(mgr.socket, 'chat:send', { orgId: 1, body: 'hello org' })
  check((await liveAtOrg)?.Body === 'hello org', 'F3 the organization receives the manager reply live')
  const notLinked = await emit(org1.socket, 'chat:send', { managerUserId: 9, body: 'who are you' })
  check(!notLinked.ok && notLinked.error.includes('not linked'), 'F4 an organization cannot write to a manager that is not linked to it', JSON.stringify(notLinked))
  const noManager = await emit(org1.socket, 'chat:send', { body: 'x' })
  check(!noManager.ok, 'F5 a manager must be chosen')
  const org3 = await signedInOrg(3)
  const leak = next(org3.socket, 'chat:message')
  await emit(mgr.socket, 'chat:send', { orgId: 1, body: 'only for org one' })
  check((await leak) === null, 'F6 another organization does not receive it')
  const readLive = next(mgr.socket, 'chat:read')
  await emit(org1.socket, 'chat:read', { managerUserId: 2 })
  check((await readLive)?.by === 'Organization', 'F7 the manager is told the organization read the chat')
  ;[mgr, org1, org3].forEach((c) => c.socket.close())

  // ---- calls: employee <-> organization <-> manager, presence, signalling, cutting
  const emp = await open(CHAT_PORT, { extraHeaders: { Cookie: `accessToken=${token(51, 'Employee')}` } })
  check(emp.ok, 'G1 an employee can connect')
  const orgA = await signedInOrg(1)
  const mgrA = await managerSocket(2)
  const snap = await new Promise((done) => { const t = setTimeout(() => done(null), 1500); orgA.socket.once('presence:snapshot', (k) => { clearTimeout(t); done(k) }); orgA.socket.disconnect().connect() })
  await new Promise((r) => setTimeout(r, 300))
  check(Array.isArray(snap) && snap.includes('Employee:51'), 'G2 the organization sees that the employee is online', JSON.stringify(snap))

  const call1 = newCall({ type: 'Organization', id: 1 }, { type: 'Employee', id: 51 })
  const incoming = next(emp.socket, 'call:incoming')
  const invited = await emit(orgA.socket, 'call:invite', { callId: call1.callId })
  const ring = await incoming
  check(invited.ok && ring?.callId === call1.callId && ring.caller.type === 'Organization', 'G3 the call rings at the employee', JSON.stringify(invited))
  const liveForManager = next(mgrA.socket, 'calls:changed')
  const accepted = Promise.all([next(emp.socket, 'call:accepted'), next(orgA.socket, 'call:accepted')])
  const answered = await emit(emp.socket, 'call:answer', { callId: call1.callId, accept: true })
  const [a1, a2] = await accepted
  check(answered.ok && a1?.status === 'Active' && a2?.status === 'Active', 'G4 the employee answers: both sides are told the call is active')

  const sig = next(emp.socket, 'call:signal')
  await emit(orgA.socket, 'call:signal', { callId: call1.callId, data: { type: 'offer', sdp: 'dummy' } })
  const got = await sig
  check(got?.data?.type === 'offer' && got.from.type === 'Organization', 'G5 the signalling message reaches the other person untouched')
  const emp2 = await open(CHAT_PORT, { extraHeaders: { Cookie: `accessToken=${token(52, 'Employee')}` } })
  const intruder = await emit(emp2.socket, 'call:signal', { callId: call1.callId, data: { type: 'offer' } })
  check(!intruder.ok, 'G6 somebody outside the call cannot send signals into it', JSON.stringify(intruder))
  check((await liveForManager) !== null, 'G7 managers are told that the calls changed (the monitor refreshes)')

  const notManager = await emit(emp.socket, 'call:cut', { callId: call1.callId, reason: 'because' })
  check(!notManager.ok, 'G8 an employee cannot cut a call')
  const endedA = Promise.all([next(emp.socket, 'call:ended'), next(orgA.socket, 'call:ended')])
  const cut = await emit(mgrA.socket, 'call:cut', { callId: call1.callId, reason: 'Unethical behaviour on screen' })
  const [e1, e2] = await endedA
  check(cut.ok && e1?.status === 'Cut' && e2?.status === 'Cut' && e1.endReason.includes('Unethical'), 'G9 the manager cuts the call: both sides are told, with the reason')
  const again = await emit(orgA.socket, 'call:end', { callId: call1.callId })
  check(!again.ok, 'G10 a cut call cannot be ended again')

  const call2 = newCall({ type: 'Employee', id: 51 }, { type: 'Manager', id: 2 }, 'audio')
  const mgrIncoming = next(mgrA.socket, 'call:incoming')
  await emit(emp.socket, 'call:invite', { callId: call2.callId })
  check((await mgrIncoming)?.callId === call2.callId, 'G11 the employee calls the manager and it rings there')
  const declined = Promise.all([next(emp.socket, 'call:ended'), next(mgrA.socket, 'call:ended')])
  await emit(mgrA.socket, 'call:answer', { callId: call2.callId, accept: false })
  const [d1] = await declined
  check(d1?.status === 'Declined', 'G12 the manager can decline')

  const call3 = newCall({ type: 'Organization', id: 1 }, { type: 'Employee', id: 51 })
  const missedBoth = Promise.all([next(emp.socket, 'call:ended', 3000), next(orgA.socket, 'call:ended', 3000)])
  await emit(orgA.socket, 'call:invite', { callId: call3.callId })
  const [missedCall] = await missedBoth
  check(missedCall?.status === 'Missed', 'G13 a call nobody answers becomes missed after the ring time')

  const call4 = newCall({ type: 'Organization', id: 1 }, { type: 'Employee', id: 51 })
  await emit(orgA.socket, 'call:invite', { callId: call4.callId })
  await emit(emp.socket, 'call:answer', { callId: call4.callId, accept: true })
  const hung = next(emp.socket, 'call:ended')
  orgA.socket.close()
  check((await hung)?.status === 'Ended', 'G14 when one side closes the page during a call, the other side is told')

  const fake = newCall({ type: 'Organization', id: 1 }, { type: 'Employee', id: 51 })
  const strangerCall = await emit(emp2.socket, 'call:invite', { callId: fake.callId })
  check(!strangerCall.ok, 'G15 somebody cannot start a call that is not theirs')
  ;[emp, emp2, mgrA].forEach((c) => c.socket.close())

  // ---- flood protection
  const flooder = await managerSocket(2)
  let blocked = 0
  for (let i = 0; i < 25; i += 1) {
    const result = await emit(flooder.socket, 'chat:send', { orgId: 2, body: `m${i}` })
    if (!result.ok && result.error.includes('too fast')) blocked += 1
  }
  check(blocked >= 4, 'E1 more than 20 messages in 10 seconds are slowed down', `blocked ${blocked}`)
  flooder.socket.close()

  ;[m1, m1b, org].forEach((c) => c.socket.close())
} finally {
  chat.removeAllListeners('exit')
  chatNoDev.removeAllListeners('exit')
  chat.kill()
  chatNoDev.kill()
  api.close()
}

console.log(failures === 0 ? 'ALL CHAT SERVER CHECKS PASSED' : `${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
