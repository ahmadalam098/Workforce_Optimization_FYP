import { asUser, markCallMissed } from './api.js'

// Audio / video calls. The ASP.NET API decides who may call whom and keeps the call session; this file only carries the live part:
// ringing, answering, ending, the manager cutting a call, who is online, and the WebRTC signalling messages (offer / answer / ICE), which are
// relayed untouched. The media itself is not built yet - the browser shows a dummy call screen - so `call:signal` is the place where real
// WebRTC will plug in without any change on the server.

export const RING_MS = Number(process.env.CALL_RING_MS) || 45_000

export const employeeRoom = (userId) => `employee:${userId}`
const PRESENCE = 'presence'
const MANAGERS = 'managers'

/** The room that holds every open tab of a call party. */
export function createCalls(io, { managerRoom, orgRoom }) {
  const roomOf = (party) => (party.type === 'Employee' ? employeeRoom(party.id) : party.type === 'Manager' ? managerRoom(party.id) : orgRoom(party.id))
  const keyOf = (party) => `${party.type}:${party.id}`

  /** callId -> { call, timer, tokens: Map(partyKey -> token) } for the calls that are still open. */
  const open = new Map()
  /** partyKey -> number of connected sockets */
  const online = new Map()

  const partyOfSocket = (socket) => {
    const { kind, userId, orgId } = socket.data
    if (kind === 'manager') return { type: 'Manager', id: userId }
    if (kind === 'employee') return { type: 'Employee', id: userId }
    if (kind === 'organization' && socket.data.token) return { type: 'Organization', id: orgId }
    return null
  }

  const sameParty = (a, b) => a.type === b.type && a.id === b.id
  const callParty = (call, side) => ({ type: call[side].type, id: call[side].id })

  function announce(call, event) {
    io.to(roomOf(callParty(call, 'caller'))).to(roomOf(callParty(call, 'callee'))).emit(event, call)
    io.to(MANAGERS).emit('calls:changed', { callId: call.callId, status: call.status })
  }

  function forget(callId) {
    const entry = open.get(callId)
    if (entry) clearTimeout(entry.timer)
    open.delete(callId)
  }

  function remember(call, token, party) {
    const entry = open.get(call.callId) ?? { call, timer: null, tokens: new Map() }
    entry.call = call
    entry.tokens.set(keyOf(party), token)
    open.set(call.callId, entry)
    return entry
  }

  async function ringTimeout(callId) {
    const entry = open.get(callId)
    if (!entry || entry.call.status !== 'Ringing') return
    try {
      const call = await markCallMissed(callId)
      forget(callId)
      announce(call, 'call:ended')
    } catch {
      forget(callId)
    }
  }

  /** Wire the call events of one socket. `handler` is the server's wrapper (answers the client, rate limit, expiry). */
  function attach(socket, handler) {
    const me = partyOfSocket(socket)
    if (!me) return

    // who is online
    const key = keyOf(me)
    const count = (online.get(key) ?? 0) + 1
    online.set(key, count)
    socket.join(PRESENCE)
    if (me.type === 'Manager') socket.join(MANAGERS)
    if (count === 1) io.to(PRESENCE).emit('presence', { key, online: true })
    socket.emit('presence:snapshot', [...online.keys()])
    socket.emit('calls:ready', { me: { ...me, key } })

    const api = () => asUser(socket.data.token)

    // The caller created the call through the API; now it rings at the other side.
    socket.on(
      'call:invite',
      handler(socket, async ({ callId }) => {
        const call = await api().getCall(callId)
        if (!sameParty(callParty(call, 'caller'), me) || call.status !== 'Ringing') throw new Error('This call cannot be started.')
        const entry = remember(call, socket.data.token, me)
        entry.timer = setTimeout(() => ringTimeout(call.callId), RING_MS)
        io.to(roomOf(callParty(call, 'callee'))).emit('call:incoming', call)
        io.to(MANAGERS).emit('calls:changed', { callId: call.callId, status: call.status })
        return { call }
      }),
    )

    socket.on(
      'call:answer',
      handler(socket, async ({ callId, accept }) => {
        const call = await api().answer(callId, accept !== false)
        const entry = open.get(call.callId)
        if (entry) clearTimeout(entry.timer)
        if (call.status === 'Active') {
          remember(call, socket.data.token, me)
          announce(call, 'call:accepted')
        } else {
          forget(call.callId)
          announce(call, 'call:ended')
        }
        return { call }
      }),
    )

    socket.on(
      'call:end',
      handler(socket, async ({ callId }) => {
        const call = await api().end(callId)
        forget(call.callId)
        announce(call, 'call:ended')
        return { call }
      }),
    )

    // The organization manager cuts a call of their employee or organization (the API checks that it is theirs and keeps the reason).
    socket.on(
      'call:cut',
      handler(socket, async ({ callId, reason }) => {
        if (me.type !== 'Manager') throw new Error('Only a manager can cut a call.')
        const call = await api().cut(callId, reason)
        forget(call.callId)
        announce(call, 'call:ended')
        return { call }
      }),
    )

    // WebRTC signalling (offer / answer / ICE candidates): passed to the other person as it is. Only the two people of an open call may use it.
    socket.on(
      'call:signal',
      handler(socket, async ({ callId, data }) => {
        let entry = open.get(callId)
        if (!entry) {
          const call = await api().getCall(callId)
          if (call.status !== 'Active' && call.status !== 'Ringing') throw new Error('This call is over.')
          entry = remember(call, socket.data.token, me)
        }
        const { call } = entry
        const caller = callParty(call, 'caller')
        const callee = callParty(call, 'callee')
        if (!sameParty(caller, me) && !sameParty(callee, me)) throw new Error('This is not your call.')
        const other = sameParty(caller, me) ? callee : caller
        io.to(roomOf(other)).emit('call:signal', { callId, from: me, data })
        return {}
      }),
    )

    socket.on('disconnect', async () => {
      const left = (online.get(key) ?? 1) - 1
      if (left > 0) {
        online.set(key, left)
        return
      }
      online.delete(key)
      io.to(PRESENCE).emit('presence', { key, online: false })

      // The last tab of this person closed during a call: hang it up for them, so the other side is not left waiting.
      for (const [callId, entry] of [...open.entries()]) {
        const { call } = entry
        if (!sameParty(callParty(call, 'caller'), me) && !sameParty(callParty(call, 'callee'), me)) continue
        try {
          const ended = await asUser(socket.data.token).end(callId)
          forget(callId)
          announce(ended, 'call:ended')
        } catch {
          forget(callId)
        }
      }
    })
  }

  return { attach, isOnline: (key) => (online.get(key) ?? 0) > 0 }
}
