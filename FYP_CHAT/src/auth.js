import { parse } from 'cookie'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

const NAME_ID = ['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier', 'nameid', 'sub']
const ROLE = ['http://schemas.microsoft.com/ws/2008/06/identity/claims/role', 'role']

const firstClaim = (payload, names) => names.map((name) => payload[name]).find((value) => value !== undefined)

export const MANAGER_ROLE = 'Organization Manager'
export const ORGANIZATION_ROLE = 'Organization'

/**
 * Reads the sign-in cookie that the ASP.NET API set at login (the HttpOnly "accessToken" JWT) and checks it with the same secret.
 * Returns { token, userId, orgId, role, expiresAt } (an organization's token has orgId from the org_id claim and no userId), or { reason } when there is no valid token (no-cookie, expired, bad-signature, bad-token).
 */
export function authenticateCookie(cookieHeader) {
  const token = parse(cookieHeader || '').accessToken
  if (!token) return { reason: 'no-cookie' }

  try {
    const payload = jwt.verify(token, config.jwtKey, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    })
    const role = String(firstClaim(payload, ROLE) ?? '')
    if (role.toLowerCase() === ORGANIZATION_ROLE.toLowerCase()) {
      const orgId = Number(payload.org_id)
      if (!Number.isInteger(orgId) || orgId <= 0) return { reason: 'bad-token' }
      return { token, orgId, role, expiresAt: (payload.exp ?? 0) * 1000 }
    }
    const userId = Number(firstClaim(payload, NAME_ID))
    if (!Number.isInteger(userId) || userId <= 0) return { reason: 'bad-token' }
    return { token, userId, role, expiresAt: (payload.exp ?? 0) * 1000 }
  } catch (error) {
    if (error.name === 'TokenExpiredError') return { reason: 'expired' }
    return { reason: error.message === 'invalid signature' ? 'bad-signature' : 'bad-token' }
  }
}
