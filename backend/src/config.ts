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
  // Panel login. The hash comes from `npm run hash-password -w backend -- <password>`;
  // without it (development only) the password is "admin".
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD_HASH: z.string().startsWith('scrypt$').optional(),
  // Signs the panel session cookie. Random per start if unset (sessions end on restart).
  SESSION_SECRET: z.string().min(32).optional(),
  // Salt of the anonymous visitor ids in the analytics. Defaults to SESSION_SECRET; changing it
  // makes every returning visitor look new once.
  ANALYTICS_SALT: z.string().min(16).optional(),
  // Number of reverse-proxy hops to trust (nginx in production = 1).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
  MAX_SITE_MB: z.coerce.number().positive().default(200),
  MAX_SITE_FILES: z.coerce.number().int().positive().default(2000),
  // SSH access to the VPS scripts that issue each site's certificate and nginx
  // server (deploy/vps). Unset in development: sites work without it.
  PROVISION_SSH_TARGET: z.string().optional(),
  PROVISION_SSH_KEY: z.string().optional(),
  PROVISION_KNOWN_HOSTS: z.string().optional(),
})

const env = envSchema.parse(process.env)
if (env.NODE_ENV === 'production' && !env.ADMIN_PASSWORD_HASH) throw new Error('ADMIN_PASSWORD_HASH is required in production')

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  dataDir: path.resolve(env.DATA_DIR),
  sitesDomain: env.SITES_DOMAIN.toLowerCase(),
  siteCookieSecret: env.SITE_COOKIE_SECRET ?? randomBytes(32).toString('base64url'),
  sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString('base64url'),
  // Stable across restarts in development too, so a visitor stays one visitor.
  analyticsSalt: env.ANALYTICS_SALT ?? env.SESSION_SECRET ?? (env.NODE_ENV === 'production' ? randomBytes(32).toString('base64url') : 'dev-analytics-salt'),
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  maxSiteBytes: env.MAX_SITE_MB * 1024 * 1024,
}

// Subdomains no project can take. "panel" is the admin panel's host in production.
export const RESERVED_NAMES = new Set(['www', 'api', 'app', 'admin', 'mail', 'static', 'assets', 'panel'])

export function siteUrl(name: string): string {
  const port = config.SITES_PUBLIC_PORT ? `:${config.SITES_PUBLIC_PORT}` : ''
  return `${config.SITES_PROTOCOL}://${name}.${config.sitesDomain}${port}`
}
