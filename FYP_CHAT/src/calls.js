import { asUser, markCallMissed } from './api.js'

// Audio / video calls. The ASP.NET API decides who may call whom and keeps the call session; this file only carries the live part:
// ringing, answering, ending, the manager cutting a call, who is online, and the WebRTC signalling messages (offer / answer / ICE), which are
// relayed untouched (the sound and picture go directly between the browsers). A manager can also watch a live call of their employee.

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
    const entry = open.get(call.callId) ?? { call, timer: null, tokens: new Map(), watchers: new Map() }
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

    // The manager watches a live call of their employee. The API says which calls are theirs (the monitor list); the employee's browser then
    // sends what it sees and hears to the manager (a second WebRTC connection) through call:watch-signal below. The call itself is not touched.
    socket.on(
      'call:watch',
      handler(socket, async ({ callId }) => {
        if (me.type !== 'Manager') throw new Error('Only a manager can watch a call.')
        const { live } = await api().monitor()
        const call = live.find((item) => item.callId === callId)
        if (!call || call.status !== 'Active') throw new Error('This call is not live (or not one of yours).')
        const sender = [callParty(call, 'caller'), callParty(call, 'callee')].find((party) => party.type === 'Employee')
        if (!sender) throw new Error('Only calls of your employees can be watched.')
        if (!(online.get(keyOf(sender)) > 0)) throw new Error('The employee is not connected right now, so the call cannot be shown.')
        const entry = open.get(call.callId) ?? remember(call, socket.data.token, me)
        entry.watchers.set(key, me)
        io.to(roomOf(sender)).emit('call:watch-request', { callId, watcher: { ...me, key } })
        return { sender: { ...sender, key: keyOf(sender) } }
      }),
    )

    socket.on(
      'call:unwatch',
      handler(socket, async ({ callId }) => {
        const entry = open.get(callId)
        if (!entry?.watchers.delete(key)) return {}
        for (const side of ['caller', 'callee']) io.to(roomOf(callParty(entry.call, side))).emit('call:watch-stop', { callId, watcher: { ...me, key } })
        return {}
      }),
    )

    // Offer / answer / ICE between a watching manager and the employee being watched. Only registered watchers and the two people of the call.
    socket.on(
      'call:watch-signal',
      handler(socket, async ({ callId, to, data }) => {
        const entry = open.get(callId)
        if (!entry || !to) throw new Error('This call is not being watched.')
        const toKey = keyOf(to)
        const parties = [callParty(entry.call, 'caller'), callParty(entry.call, 'callee')]
        const allowed = me.type === 'Manager' ? entry.watchers.has(key) && parties.some((party) => keyOf(party) === toKey) : parties.some((party) => sameParty(party, me)) && entry.watchers.has(toKey)
        if (!allowed) throw new Error('Not allowed.')
        io.to(roomOf(to)).emit('call:watch-signal', { callId, from: { ...me, key }, data })
        return {}
      }, { unlimited: true }),
    )

    // Fallback picture for a watching manager when the direct connection cannot be made: the employee's browser sends small still pictures
    // of both sides a few times a second. Only from a person of the call to a registered watcher.
    socket.on(
      'call:watch-frame',
      handler(socket, async ({ callId, to, local, remote }) => {
        const entry = open.get(callId)
        if (!entry || !to || !entry.watchers.has(keyOf(to))) return {}
        if (![callParty(entry.call, 'caller'), callParty(entry.call, 'callee')].some((party) => sameParty(party, me))) return {}
        const picture = (value) => (typeof value === 'string' && value.startsWith('data:image/jpeg') && value.length < 400_000 ? value : null)
        io.to(roomOf(to)).emit('call:watch-frame', { callId, local: picture(local), remote: picture(remote) })
        return {}
      }, { unlimited: true }),
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
      }, { unlimited: true }),
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
