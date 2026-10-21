import type { MultipartFile } from '@fastify/multipart'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { MongoServerError, ObjectId, type Filter } from 'mongodb'
import { z } from 'zod'
import { config, RESERVED_NAMES, siteUrl } from './config.js'
import { projects, visits, type ProjectDoc, type ProjectStatus } from './db.js'
import { pendingDomain, provisionDomain, provisioningEnabled, releaseDomain } from './domains.js'
import { HttpError } from './errors.js'
import { hashPassword } from './password.js'
import {
  createVersion,
  extractZip,
  pickHomepage,
  readSiteFile,
  removeSite,
  removeVersion,
  safeRelativePath,
  writeSiteFile,
  zipSite,
  type FileMap,
} from './storage.js'

// <name>.<SITES_DOMAIN> must fit in the 64 characters of a certificate's common name.
const NAME_MAX = Math.min(63, 63 - config.sitesDomain.length)

const nameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(NAME_MAX, `Máximo ${NAME_MAX} caracteres`)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Solo letras minúsculas, números y guiones (sin guion al inicio o final)')
  .refine((n) => !RESERVED_NAMES.has(n), 'Ese nombre está reservado')

const statusSchema = z.enum(['live', 'archived', 'deleted'])

const accessSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('public') }),
  // Without password keeps the current one (only valid if it already had one).
  z.object({ mode: z.literal('password'), password: z.string().min(4, 'Mínimo 4 caracteres').max(200).optional() }),
])

const TEXT_EXTENSIONS = /\.(html?|css|js|mjs|json|txt|md|svg|xml|webmanifest)$/i

function toDto(p: ProjectDoc) {
  return {
    id: p._id.toHexString(),
    name: p.name,
    url: siteUrl(p.name),
    status: p.status,
    homepage: p.homepage,
    files: p.files,
    totalSize: p.files.reduce((sum, f) => sum + f.size, 0),
    access: { mode: p.access.mode },
    domain: p.domain?.status ?? (provisioningEnabled ? 'pending' : 'ready'),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt ?? null,
  }
}

function parseId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Proyecto no encontrado')
  return new ObjectId(id)
}

async function getProject(id: string): Promise<ProjectDoc> {
  const project = await projects.findOne({ _id: parseId(id) })
  if (!project) throw new HttpError(404, 'Proyecto no encontrado')
  return project
}

async function isNameTaken(name: string, exceptId?: ObjectId): Promise<boolean> {
  const filter: Filter<ProjectDoc> = { name }
  if (exceptId) filter._id = { $ne: exceptId }
  return (await projects.countDocuments(filter, { limit: 1 })) > 0
}

const isDuplicateKey = (err: unknown) => err instanceof MongoServerError && err.code === 11000

interface UploadPayload {
  fields: Record<string, string>
  files: FileMap
}

/**
 * Reads a multipart upload. A single .zip is extracted; any other file is
 * stored at the root with its own name. The `html` field (pasted code)
 * becomes index.html.
 */
async function readUpload(request: FastifyRequest): Promise<UploadPayload> {
  const fields: Record<string, string> = {}
  const uploads: { filename: string; data: Buffer }[] = []

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const file = part as MultipartFile
      const data = await file.toBuffer()
      if (file.file.truncated) throw new HttpError(413, `Cada archivo puede pesar como máximo ${config.MAX_UPLOAD_MB} MB`)
      uploads.push({ filename: file.filename, data })
    } else {
      fields[part.fieldname] = String(part.value)
    }
  }

  const files: FileMap = new Map()
  if (fields.html?.trim()) files.set('index.html', Buffer.from(fields.html, 'utf8'))

  for (const upload of uploads) {
    if (/\.zip$/i.test(upload.filename)) {
      for (const [p, data] of await extractZip(upload.data)) files.set(p, data)
    } else {
      // Browsers send only the base name; never trust a path in it.
      const rel = safeRelativePath(upload.filename.split(/[\\/]/).pop() ?? '')
      if (rel) files.set(rel, upload.data)
    }
  }
  return { fields, files }
}

function visitsSince(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async () => ({
    sitesDomain: config.sitesDomain,
    sitesSuffix: `.${config.sitesDomain}${config.SITES_PUBLIC_PORT ? `:${config.SITES_PUBLIC_PORT}` : ''}`,
    maxUploadMb: config.MAX_UPLOAD_MB,
  }))

  app.get('/api/projects', async (request) => {
    const query = z
      .object({ status: statusSchema.default('live'), q: z.string().trim().max(100).optional() })
      .parse(request.query)

    const filter: Filter<ProjectDoc> = { status: query.status }
    if (query.q) filter.name = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }

    const [items, counts] = await Promise.all([
      projects.find(filter).sort({ updatedAt: -1 }).limit(500).toArray(),
      projects.aggregate<{ _id: ProjectStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    ])
    const countMap = { live: 0, archived: 0, deleted: 0 }
    for (const c of counts) countMap[c._id] = c.n
    return { items: items.map(toDto), counts: countMap }
  })

  app.get('/api/projects/name-availability', async (request) => {
    const { name, exceptId } = z.object({ name: z.string(), exceptId: z.string().optional() }).parse(request.query)
    const parsed = nameSchema.safeParse(name)
    if (!parsed.success) return { available: false, reason: parsed.error.issues[0].message }
    const taken = await isNameTaken(parsed.data, exceptId && ObjectId.isValid(exceptId) ? new ObjectId(exceptId) : undefined)
    return taken ? { available: false, reason: 'Ese nombre ya está en uso' } : { available: true }
  })

  app.post('/api/projects', async (request, reply) => {
    const { fields, files } = await readUpload(request)
    const name = nameSchema.parse(fields.name ?? '')
    if (files.size === 0) throw new HttpError(400, 'Sube un archivo o pega código HTML')
    if (await isNameTaken(name)) throw new HttpError(409, 'Ese nombre ya está en uso')

    const _id = new ObjectId()
    const { version, files: list } = await createVersion(_id.toHexString(), files)
    const now = new Date()
    const doc: ProjectDoc = {
      _id,
      name,
      status: 'live',
      files: list,
      homepage: pickHomepage(list.map((f) => f.path)),
      version,
      access: { mode: 'public' },
      domain: pendingDomain(),
      createdAt: now,
      updatedAt: now,
    }
    try {
      await projects.insertOne(doc)
    } catch (err) {
      await removeSite(_id.toHexString())
      if (isDuplicateKey(err)) throw new HttpError(409, 'Ese nombre ya está en uso')
      throw err
    }
    provisionDomain(doc)
    return reply.code(201).send(toDto(doc))
  })

  // mode=replace swaps every file; mode=add keeps the current ones and adds/overwrites.
  app.post<{ Params: { id: string } }>('/api/projects/:id/files', async (request) => {
    const project = await getProject(request.params.id)
    const { fields, files } = await readUpload(request)
    const mode = z.enum(['replace', 'add']).default('replace').parse(fields.mode || undefined)
    if (files.size === 0) throw new HttpError(400, 'No se recibió ningún archivo')

    const id = project._id.toHexString()
    const { version, files: list } = await createVersion(id, files, mode === 'add' ? project.version : undefined)
    const paths = list.map((f) => f.path)
    const homepage = mode === 'add' && paths.includes(project.homepage) ? project.homepage : pickHomepage(paths)

    const updated = await projects.findOneAndUpdate(
      { _id: project._id, version: project.version },
      { $set: { version, files: list, homepage, updatedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!updated) {
      await removeVersion(id, version)
      throw new HttpError(409, 'El proyecto cambió mientras subías; vuelve a intentarlo')
    }
    await removeVersion(id, project.version)
    return toDto(updated)
  })

  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
    const project = await getProject(request.params.id)
    const body = z
      .object({ name: nameSchema.optional(), access: accessSchema.optional(), homepage: z.string().optional() })
      .parse(request.body)

    const set: Partial<ProjectDoc> = { updatedAt: new Date() }
    if (body.name && body.name !== project.name) {
      if (await isNameTaken(body.name, project._id)) throw new HttpError(409, 'Ese nombre ya está en uso')
      set.name = body.name
      set.domain = pendingDomain()
    }
    if (body.access?.mode === 'public') set.access = { mode: 'public' }
    if (body.access?.mode === 'password') {
      if (body.access.password) set.access = { mode: 'password', passwordHash: await hashPassword(body.access.password) }
      else if (project.access.mode !== 'password') throw new HttpError(400, 'Indica una contraseña')
    }
    if (body.homepage !== undefined) {
      if (!project.files.some((f) => f.path === body.homepage)) throw new HttpError(400, 'Ese archivo no existe')
      set.homepage = body.homepage
    }

    try {
      const updated = await projects.findOneAndUpdate({ _id: project._id }, { $set: set }, { returnDocument: 'after' })
      if (!updated) throw new HttpError(404, 'Proyecto no encontrado')
      if (set.name) {
        provisionDomain(updated)
        if (!(await isNameTaken(project.name))) releaseDomain(project.name)
      }
      return toDto(updated)
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'Ese nombre ya está en uso')
      throw err
    }
  })

  // live <-> archived, and to/from the trash ("deleted").
  app.post<{ Params: { id: string } }>('/api/projects/:id/status', async (request) => {
    const project = await getProject(request.params.id)
    const { status } = z.object({ status: statusSchema }).parse(request.body)
    const update =
      status === 'deleted'
        ? { $set: { status, deletedAt: new Date(), updatedAt: new Date() } }
        : { $set: { status, updatedAt: new Date() }, $unset: { deletedAt: '' as const } }
    const updated = await projects.findOneAndUpdate({ _id: project._id }, update, { returnDocument: 'after' })
    if (!updated) throw new HttpError(404, 'Proyecto no encontrado')
    // Retry a failed domain when the site goes back online.
    if (updated.status === 'live' && updated.domain?.status === 'error') provisionDomain(updated)
    return toDto(updated)
  })

  // Permanent delete; only from the trash so it is always a two-step action.
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = await getProject(request.params.id)
    if (project.status !== 'deleted') throw new HttpError(400, 'Mueve primero el proyecto a la papelera')
    await projects.deleteOne({ _id: project._id })
    await visits.deleteMany({ projectId: project._id })
    await removeSite(project._id.toHexString())
    releaseDomain(project.name)
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/api/projects/:id/file', async (request) => {
    const project = await getProject(request.params.id)
    const { path } = z.object({ path: z.string() }).parse(request.query)
    if (!project.files.some((f) => f.path === path)) throw new HttpError(404, 'Archivo no encontrado')
    if (!TEXT_EXTENSIONS.test(path)) throw new HttpError(400, 'Solo se pueden editar archivos de texto')
    const data = await readSiteFile(project._id.toHexString(), project.version, path)
    return { path, content: data.toString('utf8') }
  })

  app.put<{ Params: { id: string } }>('/api/projects/:id/file', { bodyLimit: 10 * 1024 * 1024 }, async (request) => {
    const project = await getProject(request.params.id)
    const { path, content } = z.object({ path: z.string(), content: z.string() }).parse(request.body)
    if (!project.files.some((f) => f.path === path)) throw new HttpError(404, 'Archivo no encontrado')
    if (!TEXT_EXTENSIONS.test(path)) throw new HttpError(400, 'Solo se pueden editar archivos de texto')

    const size = await writeSiteFile(project._id.toHexString(), project.version, path, Buffer.from(content, 'utf8'))
    const updated = await projects.findOneAndUpdate(
      { _id: project._id, 'files.path': path },
      { $set: { 'files.$.size': size, updatedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!updated) throw new HttpError(404, 'Proyecto no encontrado')
    return toDto(updated)
  })

  app.get<{ Params: { id: string } }>('/api/projects/:id/download', async (request, reply) => {
    const project = await getProject(request.params.id)
    reply.header('content-type', 'application/zip')
    reply.header('content-disposition', `attachment; filename="${project.name}.zip"`)
    return reply.send(zipSite(project._id.toHexString(), project.version, project.files))
  })

  app.get<{ Params: { id: string } }>('/api/projects/:id/stats', async (request) => {
    const project = await getProject(request.params.id)
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query)
    const since = visitsSince(days)
    const rows = await visits.find({ projectId: project._id, day: { $gte: since } }).toArray()
    const byDay = new Map(rows.map((r) => [r.day, r.count]))

    const series: { day: string; count: number }[] = []
    const cursor = new Date(`${since}T00:00:00Z`)
    for (let i = 0; i < days; i++) {
      const day = cursor.toISOString().slice(0, 10)
      series.push({ day, count: byDay.get(day) ?? 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const [all] = await visits
      .aggregate<{ total: number }>([{ $match: { projectId: project._id } }, { $group: { _id: null, total: { $sum: '$count' } } }])
      .toArray()
    return { series, periodTotal: series.reduce((s, d) => s + d.count, 0), allTime: all?.total ?? 0 }
  })
}
