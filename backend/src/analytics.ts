import { createHash, createHmac } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { ObjectId } from 'mongodb'
import { config } from './config.js'
import { pageviews, type DeviceType, type PageviewDoc, type ProjectDoc } from './db.js'
import { safeEqual } from './password.js'

// Who counts as a visit: real browsers only. Link-preview fetchers (they download the page to draw
// the card when a link is pasted), search bots, mail security scanners, scripts and headless
// browsers all request the HTML too, and are dropped here.
const NOT_A_PERSON =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|skypeuri|teams|linkedin|twitter|pinterest|embedly|quora|vkshare|outbrain|w3c_validator|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|safelinks|proofpoint|mimecast|barracuda|cisco|scan|headless|phantom|puppeteer|playwright|selenium|curl|wget|python|httpie|http-client|httpclient|okhttp|go-http|java\/|axios|node-fetch|undici|libwww|postman|insomnia/i

/** True for requests that should not count as someone seeing the page. */
export function isNoise(request: FastifyRequest): boolean {
  const ua = request.headers['user-agent'] ?? ''
  // "Cubot" is a phone brand, not a bot.
  if (ua.length < 20 || NOT_A_PERSON.test(ua.replace(/cubot/gi, ''))) return true
  // Speculative loads the browser makes on its own (prefetch / prerender).
  const purpose = `${request.headers['sec-purpose'] ?? ''}${request.headers.purpose ?? ''}${request.headers['x-moz'] ?? ''}`
  return /prefetch|prerender|preview/i.test(purpose)
}

// --- Team -----------------------------------------------------------------------------------------

export const TEAM_COOKIE = 'wt_team'
const TEAM_DAYS = 30

const signTeam = (expires: string) => createHmac('sha256', config.sessionSecret).update(`team.${expires}`).digest('base64url')

/** "<expiry ms>.<hmac>": marks a browser as the team's so its visits are not counted. */
export function teamToken(): string {
  const expires = String(Date.now() + TEAM_DAYS * 86_400_000)
  return `${expires}.${signTeam(expires)}`
}

export function isTeamToken(token: string | undefined): boolean {
  const [expires, signature] = (token ?? '').split('.')
  if (!expires || !signature || Number(expires) < Date.now()) return false
  return safeEqual(signature, signTeam(expires))
}

export const teamCookieOptions = (domain?: string) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.SITES_PROTOCOL === 'https',
  maxAge: TEAM_DAYS * 86_400,
  ...(domain ? { domain } : {}),
})

// --- Recording ------------------------------------------------------------------------------------

/**
 * Anonymous visitor id: hash of IP + browser, salted with a server secret, so the same person on
 * the same device and network is one visitor while the raw IP is never stored.
 */
function visitorId(request: FastifyRequest, projectId: ObjectId): string {
  return createHash('sha256')
    .update(`${config.analyticsSalt}|${projectId.toHexString()}|${request.ip}|${request.headers['user-agent'] ?? ''}`)
    .digest('base64url')
    .slice(0, 16)
}

/** Coarse device info from the User-Agent; enough to tell "iPhone · Safari" from "Windows · Chrome". */
export function describeDevice(ua: string): { device: DeviceType; os: string; browser: string } {
  const device: DeviceType = /ipad|tablet|(android(?!.*mobile))/i.test(ua) ? 'tablet' : /mobi|iphone|ipod|android/i.test(ua) ? 'mobile' : 'desktop'
  const os = /iphone|ipad|ipod/i.test(ua)
    ? 'iOS'
    : /android/i.test(ua)
      ? 'Android'
      : /windows/i.test(ua)
        ? 'Windows'
        : /cros/i.test(ua)
          ? 'ChromeOS'
          : /mac os x|macintosh/i.test(ua)
            ? 'macOS'
            : /linux/i.test(ua)
              ? 'Linux'
              : 'Otro'
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /samsungbrowser/i.test(ua)
        ? 'Samsung Internet'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /chrome|crios/i.test(ua)
            ? 'Chrome'
            : /safari/i.test(ua)
              ? 'Safari'
              : 'Otro'
  return { device, os, browser }
}

/** Where the visitor came from: another site's host, or null when typed/opened directly. */
function referrerHost(request: FastifyRequest): string | null {
  const ref = request.headers.referer
  if (!ref) return null
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '')
    // Navigation inside the same site is not a source.
    return host === (request.headers.host ?? '').replace(/:\d+$/, '') ? null : host
  } catch {
    return null
  }
}

/** Records one HTML page load, unless it is noise or the team's own browser. */
export function recordPageview(request: FastifyRequest, project: ProjectDoc, path: string): void {
  if (isNoise(request) || isTeamToken(request.cookies[TEAM_COOKIE])) return
  const doc: Omit<PageviewDoc, '_id'> = {
    projectId: project._id,
    at: new Date(),
    visitor: visitorId(request, project._id),
    path,
    ...describeDevice(request.headers['user-agent'] ?? ''),
    referrer: referrerHost(request),
  }
  pageviews.insertOne(doc as PageviewDoc).catch(() => undefined)
}

// --- Reading --------------------------------------------------------------------------------------

/** Page loads by the same visitor less than this apart belong to one visit. */
const VISIT_GAP_MS = 30 * 60_000

export interface Visit {
  visitor: string
  start: Date
  end: Date
  pages: number
  device: DeviceType
  os: string
  browser: string
  referrer: string | null
}

/** Groups page loads (any order) into visits: same visitor, no gap longer than VISIT_GAP_MS. */
export function groupVisits(views: PageviewDoc[]): Visit[] {
  const sorted = [...views].sort((a, b) => a.at.getTime() - b.at.getTime())
  const open = new Map<string, Visit>()
  const visits: Visit[] = []
  for (const v of sorted) {
    const current = open.get(v.visitor)
    if (current && v.at.getTime() - current.end.getTime() <= VISIT_GAP_MS) {
      current.end = v.at
      current.pages += 1
      continue
    }
    const visit: Visit = { visitor: v.visitor, start: v.at, end: v.at, pages: 1, device: v.device, os: v.os, browser: v.browser, referrer: v.referrer }
    open.set(v.visitor, visit)
    visits.push(visit)
  }
  return visits
}

/** "YYYY-MM-DD" of a moment in the given IANA time zone (falls back to UTC). */
export function dayIn(timeZone: string): (d: Date) => string {
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  return (d) => format.format(d)
}
