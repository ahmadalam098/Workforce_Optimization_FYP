import 'dotenv/config'

const flag = (value) => String(value ?? '').toLowerCase() === 'true'

/** Everything the chat server needs, read once from the environment (.env). */
export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtKey: process.env.JWT_KEY || '',
  jwtIssuer: process.env.JWT_ISSUER || undefined,
  jwtAudience: process.env.JWT_AUDIENCE || undefined,
  apiBaseUrl: (process.env.API_BASE_URL || 'https://localhost:7259').replace(/\/+$/, ''),
  serviceKey: process.env.CHAT_SERVICE_KEY || '',
  insecureTls: flag(process.env.API_INSECURE_TLS),
  devTools: flag(process.env.CHAT_DEV_TOOLS),
  maxBodyLength: 2000,
  // simple flood protection: at most this many messages per socket in the window
  rateLimit: { messages: 20, windowMs: 10_000 },
}

export function assertConfig() {
  const missing = []
  if (!config.jwtKey) missing.push('JWT_KEY')
  if (!config.serviceKey) missing.push('CHAT_SERVICE_KEY')
  if (config.jwtKey && config.jwtKey.length < 16) {
    throw new Error('JWT_KEY in FYP_CHAT/.env is only ' + config.jwtKey.length + ' characters long. It was probably cut at a # or a space: put the value in double quotes, or run "npm run init-env -- --force".')
  }
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(' and ')} in FYP_CHAT/.env. Run "npm run init-env" (or copy .env.example to .env).`)
  }
}
