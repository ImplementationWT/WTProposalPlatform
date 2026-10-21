const dateFormat = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: '2-digit' })

export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** "Mi Propuesta v2.zip" -> "mi-propuesta-v2" */
export function slugify(text: string): string {
  return text
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

export const isTextFile = (path: string) => /\.(html?|css|js|mjs|json|txt|md|svg|xml|webmanifest)$/i.test(path)

export const isHtmlFile = (path: string) => /\.html?$/i.test(path)
