import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyCookie from '@fastify/cookie'
import fastifyFormbody from '@fastify/formbody'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { config } from './config.js'
import { HttpError } from './errors.js'
import { projectRoutes } from './projects.js'
import { rewriteSiteUrl, siteRoutes } from './sites.js'

// Built frontend, served by this same process in production.
const FRONTEND_DIST = path.resolve(import.meta.dirname, '../../frontend/dist')

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: (_address, hop) => hop < config.TRUST_PROXY_HOPS,
    rewriteUrl: rewriteSiteUrl,
  })

  await app.register(fastifyCookie)
  await app.register(fastifyFormbody)
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.maxUploadBytes, files: config.MAX_SITE_FILES, fields: 20 },
  })
  // Only for reply.sendFile() from the site routes; the root is given per call.
  await app.register(fastifyStatic, { root: config.dataDir, serve: false, cacheControl: false })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues[0]?.message ?? 'Datos no válidos' })
    }
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: (error as Error).message })
    request.log.error(error)
    return reply.code(500).send({ error: 'Error interno del servidor' })
  })

  app.get('/health', async () => ({ ok: true }))
  await app.register(projectRoutes)
  await app.register(siteRoutes)

  if (existsSync(FRONTEND_DIST)) {
    await app.register(fastifyStatic, { root: FRONTEND_DIST, decorateReply: false, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.type('text/html').sendFile('index.html', FRONTEND_DIST)
      }
      return reply.code(404).send({ error: 'No encontrado' })
    })
  }

  return app
}
