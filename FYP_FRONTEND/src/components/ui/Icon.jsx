// Inline stroke icons (no icon library needed).
const PATHS = {
  mail: 'M4 6h16v12H4z M4 7l8 6 8-6',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18 M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1 M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M9 12l2 2 4-4',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3l10 18H2z M12 10v4 M12 17.5v.5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5v.5',
  checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12l3 3 5-6',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  logout: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M18 6L6 18',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
  dashboard: 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z',
  building: 'M5 21V5l7-2v18 M12 8h7v13 M8 8h1 M8 12h1 M8 16h1 M15 12h1 M15 16h1 M3 21h18',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7.5 M18 14a6 6 0 0 1 4 7',
  file: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5',
  activity: 'M3 12h4l3 7 4-14 3 7h4',
  inbox: 'M3 13l3-8h12l3 8v6H3z M3 13h5l1 3h6l1-3h5',
  team: 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 20a6 6 0 0 1 12 0 M5 11a2.5 2.5 0 1 0 0-5 M19 11a2.5 2.5 0 1 1 0-5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  chart: 'M4 20V4 M4 20h16 M8 16v-4 M12 16V8 M16 16v-6',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  key: 'M14 10a4 4 0 1 0-3.5 4H12v2h2v2h3v-3l-3.2-3.2A4 4 0 0 0 14 10z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  refresh: 'M20 11a8 8 0 0 0-14-4L4 9 M4 4v5h5 M4 13a8 8 0 0 0 14 4l2-2 M20 20v-5h-5',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  trendUp: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  swap: 'M7 7h13 M16 3l4 4-4 4 M17 17H4 M8 13l-4 4 4 4',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 8v4l3 2',
  signal: 'M5 12a7 7 0 0 1 14 0 M8.5 12a3.5 3.5 0 0 1 7 0 M12 12v.01 M12 15v5',
  shieldAlert: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M12 8v5 M12 16v.5',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
}

function Icon({ name, size = 20, className = '', title }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}

export default Icon
