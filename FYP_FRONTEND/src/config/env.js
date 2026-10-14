// Central place for environment-based configuration.
// Empty base URL = same origin (requests go through the Vite dev proxy).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export const APP_NAME = 'WorkForceNexus'
export const APP_TAGLINE = 'Smarter Workforce • Better Tomorrow'
