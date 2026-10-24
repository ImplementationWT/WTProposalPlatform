import { MongoClient, type Collection, type ObjectId } from 'mongodb'
import { config } from './config.js'

export type ProjectStatus = 'live' | 'archived' | 'deleted'
export type DomainStatus = 'pending' | 'ready' | 'error'

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
  // HTTPS certificate + nginx server of <name>.<SITES_DOMAIN> (see domains.ts).
  domain?: { status: DomainStatus; error?: string }
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

/** Old per-day counter (counted bots and the team too). Superseded by pageviews; only cleaned up now. */
export interface VisitDoc {
  projectId: ObjectId
  day: string // YYYY-MM-DD (UTC)
  count: number
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

/** One HTML page load by a real visitor (bots, link previews and the team are not recorded). */
export interface PageviewDoc {
  _id: ObjectId
  projectId: ObjectId
  at: Date
  // Anonymous id: salted hash of IP + browser (see analytics.ts). The IP itself is not stored.
  visitor: string
  path: string
  device: DeviceType
  os: string
  browser: string
  referrer: string | null
}

/** Page loads older than this are dropped automatically (TTL index). */
const PAGEVIEW_RETENTION_DAYS = 400

const client = new MongoClient(config.MONGODB_URI)
const db = client.db(config.MONGODB_DB)

export const projects: Collection<ProjectDoc> = db.collection('projects')
export const visits: Collection<VisitDoc> = db.collection('visits')
export const pageviews: Collection<PageviewDoc> = db.collection('pageviews')

export async function connectDb(): Promise<void> {
  await client.connect()
  await projects.createIndex({ name: 1 }, { unique: true })
  await projects.createIndex({ status: 1, updatedAt: -1 })
  await visits.createIndex({ projectId: 1, day: 1 }, { unique: true })
  await pageviews.createIndex({ projectId: 1, at: -1 })
  await pageviews.createIndex({ at: 1 }, { expireAfterSeconds: PAGEVIEW_RETENTION_DAYS * 86_400 })
}

export async function closeDb(): Promise<void> {
  await client.close()
}
