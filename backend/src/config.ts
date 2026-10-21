import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DB: z.string().default('sites_platform'),
  // Folder where the published files live (one subfolder per project).
  DATA_DIR: z.string().default('./data'),
  // Sites are served at <name>.<SITES_DOMAIN>. In development *.localhost
  // resolves to 127.0.0.1 in browsers, so no DNS setup is needed.
  SITES_DOMAIN: z.string().default('localhost'),
  SITES_PROTOCOL: z.enum(['http', 'https']).default('http'),
  // Port shown in the public URLs; empty when behind a proxy on 80/443.
  SITES_PUBLIC_PORT: z.string().default('3000'),
  // Signs the cookie of password-protected sites. Random per start if unset.
  SITE_COOKIE_SECRET: z.string().min(32).optional(),
  // Number of reverse-proxy hops to trust (nginx in production = 1).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
  MAX_SITE_MB: z.coerce.number().positive().default(200),
  MAX_SITE_FILES: z.coerce.number().int().positive().default(2000),
})

const env = envSchema.parse(process.env)

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  dataDir: path.resolve(env.DATA_DIR),
  sitesDomain: env.SITES_DOMAIN.toLowerCase(),
  siteCookieSecret: env.SITE_COOKIE_SECRET ?? randomBytes(32).toString('base64url'),
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  maxSiteBytes: env.MAX_SITE_MB * 1024 * 1024,
}

export function siteUrl(name: string): string {
  const port = config.SITES_PUBLIC_PORT ? `:${config.SITES_PUBLIC_PORT}` : ''
  return `${config.SITES_PROTOCOL}://${name}.${config.sitesDomain}${port}`
}
