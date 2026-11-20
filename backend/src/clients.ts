import type { FastifyInstance } from 'fastify'
import { MongoServerError, ObjectId } from 'mongodb'
import { z } from 'zod'
import { clients, projects, type ClientDoc, type ProjectStatus } from './db.js'
import { HttpError } from './errors.js'

export const clientNameSchema = z.string().trim().min(1, 'Escribe el nombre del cliente').max(80, 'Máximo 80 caracteres')

const keyOf = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export type ClientRef = { id: string; name: string } | null

export const clientRef = (c: ClientDoc | null | undefined): ClientRef => (c ? { id: c._id.toHexString(), name: c.name } : null)

/** Every client by id, to name the client of each project in a list. */
export async function clientsById(): Promise<Map<string, ClientDoc>> {
  const all = await clients.find().toArray()
  return new Map(all.map((c) => [c._id.toHexString(), c]))
}

export async function findClient(id: ObjectId | undefined): Promise<ClientDoc | null> {
  return id ? clients.findOne({ _id: id }) : null
}

/** Finds a client by name (case and spacing don't matter) or creates it. */
async function findOrCreateByName(name: string): Promise<ClientDoc> {
  const clean = clientNameSchema.parse(name).replace(/\s+/g, ' ')
  const now = new Date()
  const doc = await clients.findOneAndUpdate(
    { key: keyOf(clean) },
    { $setOnInsert: { name: clean, key: keyOf(clean), createdAt: now, updatedAt: now } },
    { upsert: true, returnDocument: 'after' },
  )
  return doc!
}

/**
 * The client a project goes under, from the panel (clientId) or from the API (client = name, created
 * if new, so a publishing tool doesn't need the id). '' / 'none' / null = no client.
 */
export async function resolveClient(input: { clientId?: string | null; client?: string | null }): Promise<ObjectId | null | undefined> {
  if (input.clientId !== undefined) {
    if (!input.clientId || input.clientId === 'none') return null
    if (!ObjectId.isValid(input.clientId)) throw new HttpError(400, 'Cliente no válido')
    const found = await clients.findOne({ _id: new ObjectId(input.clientId) })
    if (!found) throw new HttpError(400, 'Ese cliente no existe')
    return found._id
  }
  if (input.client !== undefined) {
    if (!input.client?.trim()) return null
    return (await findOrCreateByName(input.client))._id
  }
  return undefined // not given: leave as is
}

function parseClientId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Cliente no encontrado')
  return new ObjectId(id)
}

const isDuplicateKey = (err: unknown) => err instanceof MongoServerError && err.code === 11000

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  // Clients A-Z with how many projects each has per status; `none` counts the unfiled ones.
  app.get('/api/clients', async () => {
    const [all, counts] = await Promise.all([
      clients.find().sort({ key: 1 }).toArray(),
      projects
        .aggregate<{ _id: { client: ObjectId | null; status: ProjectStatus }; n: number }>([
          { $group: { _id: { client: { $ifNull: ['$clientId', null] }, status: '$status' }, n: { $sum: 1 } } },
        ])
        .toArray(),
    ])
    const empty = () => ({ live: 0, archived: 0, deleted: 0 })
    const byClient = new Map<string, Record<ProjectStatus, number>>()
    const none = empty()
    for (const { _id, n } of counts) {
      if (!_id.client) {
        none[_id.status] = n
        continue
      }
      const key = _id.client.toHexString()
      if (!byClient.has(key)) byClient.set(key, empty())
      byClient.get(key)![_id.status] = n
    }
    return {
      items: all.map((c) => ({ ...clientRef(c)!, counts: byClient.get(c._id.toHexString()) ?? empty() })),
      none,
    }
  })

  app.post('/api/clients', async (request, reply) => {
    const { name } = z.object({ name: clientNameSchema }).parse(request.body)
    const clean = name.replace(/\s+/g, ' ')
    const now = new Date()
    const doc: ClientDoc = { _id: new ObjectId(), name: clean, key: keyOf(clean), createdAt: now, updatedAt: now }
    try {
      await clients.insertOne(doc)
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'Ya existe un cliente con ese nombre')
      throw err
    }
    return reply.code(201).send(clientRef(doc))
  })

  app.patch<{ Params: { id: string } }>('/api/clients/:id', async (request) => {
    const { name } = z.object({ name: clientNameSchema }).parse(request.body)
    const clean = name.replace(/\s+/g, ' ')
    try {
      const updated = await clients.findOneAndUpdate(
        { _id: parseClientId(request.params.id) },
        { $set: { name: clean, key: keyOf(clean), updatedAt: new Date() } },
        { returnDocument: 'after' },
      )
      if (!updated) throw new HttpError(404, 'Cliente no encontrado')
      return clientRef(updated)
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, 'Ya existe un cliente con ese nombre')
      throw err
    }
  })

  // Deleting a client never touches its sites: they stay published, under "Sin cliente".
  app.delete<{ Params: { id: string } }>('/api/clients/:id', async (request, reply) => {
    const _id = parseClientId(request.params.id)
    const { deletedCount } = await clients.deleteOne({ _id })
    if (!deletedCount) throw new HttpError(404, 'Cliente no encontrado')
    await projects.updateMany({ clientId: _id }, { $unset: { clientId: '' } })
    return reply.code(204).send()
  })
}
