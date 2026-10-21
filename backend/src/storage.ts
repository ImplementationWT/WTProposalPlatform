import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { config } from './config.js'
import type { SiteFile } from './db.js'
import { HttpError } from './errors.js'

export type FileMap = Map<string, Buffer>

const IGNORED_SEGMENTS = new Set(['__MACOSX', '.DS_Store', 'Thumbs.db', '.git'])

/** Normalizes a relative path from an upload; null when it is unsafe or junk. */
export function safeRelativePath(raw: string): string | null {
  if (raw.includes('\0')) return null
  const segments = raw.replaceAll('\\', '/').split('/').filter((s) => s !== '' && s !== '.')
  if (segments.length === 0) return null
  if (segments.some((s) => s === '..' || IGNORED_SEGMENTS.has(s))) return null
  return segments.join('/')
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/**
 * Extracts a zip in memory. Sizes declared in the zip are checked against the
 * limits before reading anything, and yauzl fails if an entry inflates beyond
 * its declared size, so a zip bomb cannot exhaust memory.
 */
export async function extractZip(buffer: Buffer): Promise<FileMap> {
  let zip: yauzl.ZipFile
  try {
    zip = await yauzl.fromBufferPromise(buffer, { lazyEntries: true, autoClose: false })
  } catch {
    throw new HttpError(400, 'El archivo .zip no es válido')
  }

  try {
    const entries = await new Promise<yauzl.Entry[]>((resolve, reject) => {
      const list: yauzl.Entry[] = []
      zip.on('entry', (entry: yauzl.Entry) => {
        list.push(entry)
        zip.readEntry()
      })
      zip.on('end', () => resolve(list))
      zip.on('error', reject)
      zip.readEntry()
    })

    const fileEntries = entries.filter((e) => !e.fileName.endsWith('/'))
    if (fileEntries.length > config.MAX_SITE_FILES) {
      throw new HttpError(413, `El zip supera el máximo de ${config.MAX_SITE_FILES} archivos`)
    }
    const declared = fileEntries.reduce((sum, e) => sum + e.uncompressedSize, 0)
    if (declared > config.maxSiteBytes) {
      throw new HttpError(413, `El contenido descomprimido supera ${config.MAX_SITE_MB} MB`)
    }

    const files: FileMap = new Map()
    for (const entry of fileEntries) {
      const rel = safeRelativePath(entry.fileName)
      if (!rel) continue
      files.set(rel, await streamToBuffer(await zip.openReadStreamPromise(entry)))
    }
    return stripCommonRoot(files)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(400, 'No se pudo leer el contenido del .zip')
  } finally {
    zip.close()
  }
}

/** A zip of a folder ("mysite/index.html", ...) is published from inside it. */
function stripCommonRoot(files: FileMap): FileMap {
  const paths = [...files.keys()]
  if (paths.length === 0) return files
  const root = paths[0].split('/')[0]
  if (!paths.every((p) => p.startsWith(`${root}/`))) return files
  return new Map([...files].map(([p, data]) => [p.slice(root.length + 1), data]))
}

const isHtml = (p: string) => /\.html?$/i.test(p)

/** index.html at the root, else the shallowest HTML file, else the first file. */
export function pickHomepage(paths: string[]): string {
  const sorted = [...paths].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  return (
    sorted.find((p) => p.toLowerCase() === 'index.html') ??
    sorted.find((p) => p.toLowerCase() === 'index.htm') ??
    sorted.find(isHtml) ??
    sorted[0]
  )
}

export function siteRoot(projectId: string): string {
  return path.join(config.dataDir, 'sites', projectId)
}

export function versionDir(projectId: string, version: string): string {
  return path.join(siteRoot(projectId), version)
}

const newVersion = () => `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`

async function writeFiles(dir: string, files: FileMap): Promise<void> {
  for (const [rel, data] of files) {
    const target = path.join(dir, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
}

async function listFiles(dir: string): Promise<SiteFile[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true })
  const files: SiteFile[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const full = path.join(entry.parentPath, entry.name)
    const { size } = await fs.stat(full)
    files.push({ path: path.relative(dir, full).split(path.sep).join('/'), size })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function checkLimits(files: SiteFile[]): void {
  if (files.length > config.MAX_SITE_FILES) {
    throw new HttpError(413, `El sitio supera el máximo de ${config.MAX_SITE_FILES} archivos`)
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > config.maxSiteBytes) {
    throw new HttpError(413, `El sitio supera ${config.MAX_SITE_MB} MB`)
  }
}

/**
 * Writes a new version of the site: only `files` (replace) or the current
 * version plus `files` on top (add). The caller switches the project's
 * pointer and then removes the previous version.
 */
export async function createVersion(
  projectId: string,
  files: FileMap,
  base?: string,
): Promise<{ version: string; files: SiteFile[] }> {
  const version = newVersion()
  const dir = versionDir(projectId, version)
  try {
    if (base) await fs.cp(versionDir(projectId, base), dir, { recursive: true })
    else await fs.mkdir(dir, { recursive: true })
    await writeFiles(dir, files)
    const list = await listFiles(dir)
    checkLimits(list)
    return { version, files: list }
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true })
    throw err
  }
}

export async function removeVersion(projectId: string, version: string): Promise<void> {
  await fs.rm(versionDir(projectId, version), { recursive: true, force: true })
}

export async function removeSite(projectId: string): Promise<void> {
  await fs.rm(siteRoot(projectId), { recursive: true, force: true })
}

export async function readSiteFile(projectId: string, version: string, rel: string): Promise<Buffer> {
  return fs.readFile(path.join(versionDir(projectId, version), rel))
}

/** In-place edit of one file (Edit HTML); write + rename so readers never see half a file. */
export async function writeSiteFile(projectId: string, version: string, rel: string, data: Buffer): Promise<number> {
  const target = path.join(versionDir(projectId, version), rel)
  const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, target)
  return data.length
}

export function zipSite(projectId: string, version: string, files: SiteFile[]): Readable {
  const zip = new yazl.ZipFile()
  for (const f of files) zip.addFile(path.join(versionDir(projectId, version), f.path), f.path)
  zip.end()
  return zip.outputStream as Readable
}
