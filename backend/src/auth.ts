import { createHmac } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { TEAM_COOKIE, teamCookieOptions, teamToken } from './analytics.js'
import { config } from './config.js'
import { HttpError } from './errors.js'
import { hashPassword, safeEqual, verifyPassword } from './password.js'

const COOKIE = 'panel_session'
const SESSION_DAYS = 7
// After this many failed logins an IP waits LOCK_MINUTES.
const MAX_FAILURES = 5
const LOCK_MINUTES = 15

// Development without ADMIN_PASSWORD_HASH: the password is "admin" (config.ts forbids it in production).
const passwordHash = config.ADMIN_PASSWORD_HASH ?? (await hashPassword('admin'))

const sign = (payload: string) => createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')

/** "<username>.<expiry ms>.<hmac>"; changing SESSION_SECRET ends every session. */
function sessionToken(username: string): string {
  const payload = `${Buffer.from(username).toString('base64url')}.${Date.now() + SESSION_DAYS * 86_400_000}`
  return `${payload}.${sign(payload)}`
}

function sessionUser(request: FastifyRequest): string | null {
  const [user, expires, signature] = (request.cookies[COOKIE] ?? '').split('.')
  if (!user || !expires || !signature) return null
  if (!safeEqual(signature, sign(`${user}.${expires}`)) || Number(expires) < Date.now()) return null
  const username = Buffer.from(user, 'base64url').toString()
  return username === config.ADMIN_USERNAME ? username : null
}

const failures = new Map<string, { count: number; until: number }>()

function lockedOut(ip: string): boolean {
  const entry = failures.get(ip)
  if (!entry) return false
  if (entry.until && entry.until < Date.now()) failures.delete(ip)
  return Boolean(entry.until) && entry.until >= Date.now()
}

function recordFailure(ip: string) {
  const entry = failures.get(ip) ?? { count: 0, until: 0 }
  entry.count += 1
  if (entry.count >= MAX_FAILURES) entry.until = Date.now() + LOCK_MINUTES * 60_000
  failures.set(ip, entry)
}

const sameOrigin = (request: FastifyRequest) => {
  const origin = request.headers.origin
  if (!origin) return true // not a browser request
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

/**
 * Root onRequest hook for /api/*. Published sites live on sibling subdomains
 * (same site for the browser), so the cookie alone is not enough: writes must
 * also come from the panel's own origin.
 */
export async function panelGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!request.url.startsWith('/api/')) return
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) {
    return reply.code(403).send({ error: 'Origen no permitido' })
  }
  if (request.url.startsWith('/api/auth/')) return
  if (!sessionUser(request)) return reply.code(401).send({ error: 'Inicia sesión para continuar' })
}

/**
 * Marks this browser as the team's, so its visits to the published sites are not counted. The cookie
 * goes on the sites' parent domain when the panel lives under it (panel.<SITES_DOMAIN> in
 * production); the token is also returned for the panel's own "open site" links (see sites.ts).
 */
function markTeam(request: FastifyRequest, reply: FastifyReply): string {
  const token = teamToken()
  const host = (request.headers.host ?? '').toLowerCase().replace(/:\d+$/, '')
  const shared = host === config.sitesDomain || host.endsWith(`.${config.sitesDomain}`)
  reply.setCookie(TEAM_COOKIE, token, teamCookieOptions(shared && config.sitesDomain !== 'localhost' ? config.sitesDomain : undefined))
  return token
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/session', async (request, reply) => {
    const username = sessionUser(request)
    if (!username) return reply.code(401).send({ error: 'Sin sesión' })
    return { username, teamToken: markTeam(request, reply) }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = z.object({ username: z.string().max(200), password: z.string().max(200) }).parse(request.body)
    if (lockedOut(request.ip)) throw new HttpError(429, `Demasiados intentos. Espera ${LOCK_MINUTES} minutos.`)

    const validPassword = await verifyPassword(password, passwordHash)
    if (!safeEqual(username.trim(), config.ADMIN_USERNAME) || !validPassword) {
      recordFailure(request.ip)
      throw new HttpError(401, 'Usuario o contraseña incorrectos')
    }
    failures.delete(request.ip)
    reply.setCookie(COOKIE, sessionToken(config.ADMIN_USERNAME), {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.isProduction,
      maxAge: SESSION_DAYS * 86_400,
    })
    return { username: config.ADMIN_USERNAME, teamToken: markTeam(request, reply) }
  })

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE, { path: '/' })
    return reply.code(204).send()
  })
}
