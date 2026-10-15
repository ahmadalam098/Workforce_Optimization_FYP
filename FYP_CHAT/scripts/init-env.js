// Creates FYP_CHAT/.env from the backend's appsettings.json so the two always share the same secrets.
// The values are copied, never printed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', '.env')
const settingsPath = resolve(here, '..', '..', 'FYP_BACKEND', 'fyp_project', 'appsettings.json')

const force = process.argv.includes('--force')
if (existsSync(target) && !force) {
  console.log('.env already exists - nothing changed. (Use "npm run init-env -- --force" to write it again.)')
  process.exit(0)
}
if (!existsSync(settingsPath)) {
  console.error('Cannot find FYP_BACKEND/fyp_project/appsettings.json. Copy .env.example to .env and fill it in by hand.')
  process.exit(1)
}

const settings = JSON.parse(readFileSync(settingsPath, 'utf8').replace(/^﻿/, ''))
const jwt = settings.Jwt ?? {}
const serviceKey = settings.Chat?.ServiceKey
if (!jwt.Key || !serviceKey) {
  console.error('appsettings.json needs "Jwt:Key" and "Chat:ServiceKey".')
  process.exit(1)
}

// Values are quoted: an unquoted # starts a comment in a .env file and would cut a secret short.
const quote = (value) => {
  const text = String(value ?? '')
  if (!text.includes('"')) return `"${text}"`
  if (!text.includes("'")) return `'${text}'`
  throw new Error('A value contains both " and quote characters; write .env by hand.')
}

writeFileSync(
  target,
  [
    'PORT=4000',
    `JWT_KEY=${quote(jwt.Key)}`,
    `JWT_ISSUER=${quote(jwt.Issuer)}`,
    `JWT_AUDIENCE=${quote(jwt.Audience)}`,
    'API_BASE_URL=https://localhost:7259',
    `CHAT_SERVICE_KEY=${quote(serviceKey)}`,
    'API_INSECURE_TLS=true',
    'CHAT_DEV_TOOLS=false',
    '',
  ].join('\n'),
)
console.log('Created .env (values copied from appsettings.json).')
