import { MongoClient, type Collection, type ObjectId } from 'mongodb'
import { config } from './config.js'

export type ProjectStatus = 'live' | 'archived' | 'deleted'

export interface SiteFile {
  path: string
  size: number
}

export interface ProjectDoc {
  _id: ObjectId
  // Subdomain; unique across every status so a trashed site keeps its name.
  name: string
  status: ProjectStatus
  files: SiteFile[]
  homepage: string
  // Folder under DATA_DIR/sites/<id>/ holding the current files. Replacing
  // files writes a new version and then switches this pointer.
  version: string
  access: { mode: 'public' } | { mode: 'password'; passwordHash: string }
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export interface VisitDoc {
  projectId: ObjectId
  day: string // YYYY-MM-DD (UTC)
  count: number
}

const client = new MongoClient(config.MONGODB_URI)
const db = client.db(config.MONGODB_DB)

export const projects: Collection<ProjectDoc> = db.collection('projects')
export const visits: Collection<VisitDoc> = db.collection('visits')

export async function connectDb(): Promise<void> {
  await client.connect()
  await projects.createIndex({ name: 1 }, { unique: true })
  await projects.createIndex({ status: 1, updatedAt: -1 })
  await visits.createIndex({ projectId: 1, day: 1 }, { unique: true })
}

export async function closeDb(): Promise<void> {
  await client.close()
}
