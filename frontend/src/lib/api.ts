export type ProjectStatus = 'live' | 'archived' | 'deleted'
/** HTTPS certificate of the subdomain: issued in the background after publishing or renaming. */
export type DomainStatus = 'pending' | 'ready' | 'error'

export interface SiteFile {
  path: string
  size: number
}

export interface Project {
  id: string
  name: string
  url: string
  status: ProjectStatus
  homepage: string
  files: SiteFile[]
  totalSize: number
  access: { mode: 'public' | 'password' }
  domain: DomainStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ProjectList {
  items: Project[]
  counts: Record<ProjectStatus, number>
}

export interface AppConfig {
  sitesDomain: string
  sitesSuffix: string
  maxUploadMb: number
}

export interface Stats {
  series: { day: string; count: number }[]
  periodTotal: number
  allTime: number
}

export class ApiError extends Error {}

export interface Session {
  username: string
}

/** Called when the session expires mid-use (any 401 outside the login form). */
let unauthorizedHandler = () => {}
export const onUnauthorized = (handler: () => void) => {
  unauthorizedHandler = handler
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 && !url.startsWith('/api/auth/')) unauthorizedHandler()
  if (!res.ok) throw new ApiError(body.error ?? `Error ${res.status}`)
  return body as T
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
})

/** XHR instead of fetch to report upload progress (0-1). */
function upload<T>(url: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let body: { error?: string } = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // non-JSON error page (e.g. a proxy's 413)
      }
      if (xhr.status === 401) unauthorizedHandler()
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else reject(new ApiError(body.error ?? (xhr.status === 413 ? 'El archivo es demasiado grande' : `Error ${xhr.status}`)))
    }
    xhr.onerror = () => reject(new ApiError('No se pudo conectar con el servidor'))
    xhr.send(form)
  })
}

export const api = {
  /** Current session, or null when logged out. */
  session: async (): Promise<Session | null> => {
    const res = await fetch('/api/auth/session')
    return res.ok ? res.json() : null
  },
  login: (username: string, password: string) => request<Session>('/api/auth/login', json('POST', { username, password })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  config: () => request<AppConfig>('/api/config'),

  list: (status: ProjectStatus, q: string) =>
    request<ProjectList>(`/api/projects?${new URLSearchParams({ status, ...(q ? { q } : {}) })}`),

  nameAvailability: (name: string, exceptId?: string) =>
    request<{ available: boolean; reason?: string }>(
      `/api/projects/name-availability?${new URLSearchParams({ name, ...(exceptId ? { exceptId } : {}) })}`,
    ),

  create: (data: { name: string; files?: File[]; html?: string }, onProgress?: (p: number) => void) => {
    const form = new FormData()
    form.append('name', data.name)
    if (data.html) form.append('html', data.html)
    for (const file of data.files ?? []) form.append('file', file)
    return upload<Project>('/api/projects', form, onProgress)
  },

  uploadFiles: (id: string, mode: 'replace' | 'add', files: File[], onProgress?: (p: number) => void) => {
    const form = new FormData()
    form.append('mode', mode)
    for (const file of files) form.append('file', file)
    return upload<Project>(`/api/projects/${id}/files`, form, onProgress)
  },

  update: (
    id: string,
    data: { name?: string; homepage?: string; access?: { mode: 'public' } | { mode: 'password'; password?: string } },
  ) => request<Project>(`/api/projects/${id}`, json('PATCH', data)),

  setStatus: (id: string, status: ProjectStatus) => request<Project>(`/api/projects/${id}/status`, json('POST', { status })),

  remove: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  readFile: (id: string, path: string) =>
    request<{ path: string; content: string }>(`/api/projects/${id}/file?${new URLSearchParams({ path })}`),

  writeFile: (id: string, path: string, content: string) =>
    request<Project>(`/api/projects/${id}/file`, json('PUT', { path, content })),

  stats: (id: string, days = 30) => request<Stats>(`/api/projects/${id}/stats?days=${days}`),

  downloadUrl: (id: string) => `/api/projects/${id}/download`,
}
