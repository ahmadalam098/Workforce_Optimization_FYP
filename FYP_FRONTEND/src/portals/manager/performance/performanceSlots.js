// Performance monitoring shows the real audio / video calls (live and finished, with "Cut this call") of the manager's employees and
// organizations. Chats, recordings, transcripts and quality scores do not exist yet. These are the "slots" the later work plugs into:
//
//   1. useMonitoredSessions() in useMonitoredSessions.js  - already returns the calls; add chats, recordings, transcript and score there.
//   2. Each session is expected to look like:
//        { sessionId, type: 'audio' | 'video' | 'chat', employeeId, employeeName, organizationId, organizationName,
//          startedAt, durationSeconds, mediaUrl (audio/video file, null for chat), transcript: [{ at, speaker, text }],
//          score (0-100 or null), sentiment ('positive' | 'neutral' | 'negative' | null), reviewNote }
//   3. SessionViewer.jsx already has the place for the player, the transcript and the review score.

export const SESSION_TYPES = [
  { value: 'audio', label: 'Audio calls', icon: 'phone' },
  { value: 'video', label: 'Video calls', icon: 'video' },
  { value: 'chat', label: 'Chats', icon: 'message' },
]

export const SESSION_TYPE_OPTIONS = SESSION_TYPES.map(({ value, label }) => ({ value, label }))

/** The numbers shown on top of the page. They are "—" until sessions are monitored. */
export const SCORECARD_SLOTS = [
  { key: 'sessions', label: 'Sessions monitored', caption: 'Audio, video and chat together' },
  { key: 'quality', label: 'Average quality score', caption: 'Out of 100, from the reviews' },
  { key: 'handling', label: 'Average handling time', caption: 'Per call or chat' },
  { key: 'sentiment', label: 'Customer sentiment', caption: 'Positive compared with negative' },
]
