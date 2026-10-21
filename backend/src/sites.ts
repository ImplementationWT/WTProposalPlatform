import type { IncomingMessage } from 'node:http'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { config, RESERVED_NAMES } from './config.js'
import { projects, visits, type ProjectDoc } from './db.js'
import { safeEqual, siteToken, verifyPassword } from './password.js'
import { versionDir } from './storage.js'

/** Internal prefix the site requests are rewritten to; never reachable from the app host. */
export const SITE_PREFIX = '/__site'
const AUTH_PATH = '/__auth'
const COOKIE = 'site_auth'

type SiteRequest = IncomingMessage & { siteName?: string }

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** Returns the site name if the Host header is <name>.<SITES_DOMAIN>. */
export function siteNameFromHost(host: string | undefined): string | null {
  if (!host) return null
  const hostname = host.toLowerCase().replace(/:\d+$/, '')
  const suffix = `.${config.sitesDomain}`
  if (!hostname.endsWith(suffix)) return null
  const name = hostname.slice(0, -suffix.length)
  // Reserved hosts (e.g. panel.<SITES_DOMAIN>) serve the app, not a site.
  return SUBDOMAIN.test(name) && !RESERVED_NAMES.has(name) ? name : null
}

/** Fastify `rewriteUrl`: requests to a site host are routed under SITE_PREFIX. */
export function rewriteSiteUrl(req: SiteRequest): string {
  const url = req.url ?? '/'
  const name = siteNameFromHost(req.headers.host)
  if (!name) return url
  req.siteName = name
  return `${SITE_PREFIX}/${name}${url}`
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f7f9;color:#111}
main{background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 24px #0001;width:min(360px,90vw);text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#666;margin:0 0 20px;font-size:14px}
input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:12px}
button{width:100%;padding:10px;border:0;border-radius:8px;background:#0b6bff;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{color:#d32;font-size:13px;margin-bottom:12px}
</style></head><body><main>${body}</main></body></html>`
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function notFound(reply: FastifyReply) {
  return reply
    .code(404)
    .type('text/html; charset=utf-8')
    .send(page('No encontrado', '<h1>404</h1><p>Este sitio o página no existe.</p>'))
}

function passwordPage(reply: FastifyReply, next: string, error?: string) {
  return reply
    .code(401)
    .header('cache-control', 'no-store')
    .type('text/html; charset=utf-8')
    .send(
      page(
        'Sitio protegido',
        `<h1>Sitio protegido</h1><p>Introduce la contraseña para continuar.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
<form method="post" action="${AUTH_PATH}"><input type="hidden" name="next" value="${escapeHtml(next)}">
<input type="password" name="password" placeholder="Contraseña" autofocus required>
<button type="submit">Entrar</button></form>`,
      ),
    )
}

/** Only same-site relative paths, so the form cannot redirect elsewhere. */
const safeNext = (next: unknown) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'

function isUnlocked(project: ProjectDoc, cookie: string | undefined): boolean {
  if (project.access.mode !== 'password') return true
  if (!cookie) return false
  return safeEqual(cookie, siteToken(config.siteCookieSecret, project._id.toHexString(), project.access.passwordHash))
}

/** Maps a request path to a published file: exact, folder index, or "clean URL" (/about -> about.html). */
function resolveFile(project: ProjectDoc, rawPath: string): { file?: string; redirect?: string } {
  let rel: string
  try {
    rel = decodeURIComponent(rawPath).replace(/^\/+/, '')
  } catch {
    return {}
  }
  const exists = (p: string) => project.files.some((f) => f.path === p)
  if (rel === '') return { file: project.homepage }
  if (rel.endsWith('/')) return exists(`${rel}index.html`) ? { file: `${rel}index.html` } : {}
  if (exists(rel)) return { file: rel }
  if (exists(`${rel}.html`)) return { file: `${rel}.html` }
  // Relative links inside a sub-folder need the trailing slash.
  if (exists(`${rel}/index.html`)) return { redirect: `/${rel}/` }
  return {}
}

function countVisit(project: ProjectDoc): void {
  const day = new Date().toISOString().slice(0, 10)
  visits
    .updateOne({ projectId: project._id, day }, { $inc: { count: 1 } }, { upsert: true })
    .catch(() => undefined)
}

const findLive = (name: string) => projects.findOne({ name, status: 'live' })

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  // The prefixed routes exist only for rewritten requests, so /__site/... on
  // the app host is a 404 and a site cannot be served from another host.
  const fromSiteHost = (raw: SiteRequest, name: string) => raw.siteName === name

  app.post<{ Params: { name: string }; Body: { password?: string; next?: string } }>(
    `${SITE_PREFIX}/:name${AUTH_PATH}`,
    async (request, reply) => {
      const { name } = request.params
      if (!fromSiteHost(request.raw, name)) return notFound(reply)
      const project = await findLive(name)
      if (!project) return notFound(reply)
      const next = safeNext(request.body?.next)
      if (project.access.mode !== 'password') return reply.redirect(next, 303)

      const ok = await verifyPassword(String(request.body?.password ?? ''), project.access.passwordHash)
      if (!ok) return passwordPage(reply, next, 'Contraseña incorrecta')

      reply.setCookie(COOKIE, siteToken(config.siteCookieSecret, project._id.toHexString(), project.access.passwordHash), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.SITES_PROTOCOL === 'https',
        maxAge: 60 * 60 * 24 * 7,
      })
      return reply.redirect(next, 303)
    },
  )

  app.route<{ Params: { name: string; '*': string } }>({
    method: ['GET', 'HEAD'],
    url: `${SITE_PREFIX}/:name/*`,
    handler: async (request, reply) => {
      const { name } = request.params
      if (!fromSiteHost(request.raw, name)) return notFound(reply)
      const project = await findLive(name)
      if (!project) return notFound(reply)

      const originalPath = `/${request.params['*']}`
      if (!isUnlocked(project, request.cookies[COOKIE])) {
        const query = request.raw.url?.includes('?') ? request.raw.url.slice(request.raw.url.indexOf('?')) : ''
        return passwordPage(reply, originalPath + query)
      }

      const { file, redirect } = resolveFile(project, originalPath)
      if (redirect) return reply.redirect(redirect, 301)
      if (!file) return notFound(reply)

      if (request.method === 'GET' && /\.html?$/i.test(file)) countVisit(project)
      // Always revalidate (ETag) so an update is visible at once.
      reply.header('cache-control', project.access.mode === 'password' ? 'private, no-cache' : 'public, no-cache')
      return reply.sendFile(file, versionDir(project._id.toHexString(), project.version))
    },
  })
}
