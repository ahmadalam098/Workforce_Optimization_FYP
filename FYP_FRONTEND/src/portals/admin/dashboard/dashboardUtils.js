// Segment colors for availability (distinct hues, readable on the sand background).
export const STATUS_COLORS = {
  Available: '#2f9e6b',
  Assigned: '#3b6fc4',
  Busy: '#e0a020',
  Idle: '#a79f90',
  OnBreak: '#d98b3a',
  Offline: '#6b6558',
  OnLeave: '#8a5fb8',
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
