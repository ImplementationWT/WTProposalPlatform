import { execFile } from 'node:child_process'
import type { FastifyBaseLogger } from 'fastify'
import type { ObjectId } from 'mongodb'
import { config } from './config.js'
import { projects, type DomainStatus, type ProjectDoc } from './db.js'

/**
 * Each site needs its own HTTPS certificate and nginx server on the VPS. The
 * scripts in deploy/vps do that as root; this process may only ask, over SSH
 * with a forced command, for `ensure <name>` or `release <name>`.
 * Without PROVISION_SSH_TARGET (development) every domain counts as ready.
 */
export const provisioningEnabled = Boolean(config.PROVISION_SSH_TARGET)

let log: FastifyBaseLogger | undefined
// One request at a time: certbot refuses to run twice at once.
let queue: Promise<unknown> = Promise.resolve()

function runRemote(command: string): Promise<void> {
  const args = ['-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes']
  if (config.PROVISION_SSH_KEY) args.push('-i', config.PROVISION_SSH_KEY)
  if (config.PROVISION_KNOWN_HOSTS) args.push('-o', `UserKnownHostsFile=${config.PROVISION_KNOWN_HOSTS}`)
  args.push(config.PROVISION_SSH_TARGET!, command)
  return new Promise((resolve, reject) => {
    execFile('ssh', args, { timeout: 180_000 }, (error, _stdout, stderr) => {
      if (!error) return resolve()
      // The scripts print "ERROR: <reason>" as their last stderr line.
      const reason = stderr.match(/ERROR: (.+)\s*$/)?.[1] ?? stderr.trim().split('\n').pop() ?? error.message
      reject(new Error(reason))
    })
  })
}

function enqueue(command: string): Promise<void> {
  const run = queue.then(() => runRemote(command))
  queue = run.catch(() => undefined)
  return run
}

/** Only writes the outcome if the project still has that name (it may have been renamed meanwhile). */
async function setStatus(id: ObjectId, name: string, status: DomainStatus, error?: string) {
  await projects.updateOne({ _id: id, name }, { $set: { domain: error ? { status, error } : { status } } })
}

/** Value for a new or renamed project's `domain` field. */
export const pendingDomain = (): ProjectDoc['domain'] => ({ status: provisioningEnabled ? 'pending' : 'ready' })

/** Issues the certificate and nginx server of the project's subdomain, in the background. */
export function provisionDomain(project: Pick<ProjectDoc, '_id' | 'name'>): void {
  if (!provisioningEnabled) return
  const { _id, name } = project
  enqueue(`ensure ${name}`)
    .then(() => setStatus(_id, name, 'ready'))
    .then(() => log?.info({ name }, 'domain ready'))
    .catch(async (err: Error) => {
      log?.error({ name, err: err.message }, 'domain provisioning failed')
      await setStatus(_id, name, 'error', err.message).catch(() => undefined)
    })
}

/** Removes the nginx server and certificate of a subdomain no project uses any more. */
export function releaseDomain(name: string): void {
  if (!provisioningEnabled) return
  enqueue(`release ${name}`).catch((err: Error) => log?.error({ name, err: err.message }, 'domain release failed'))
}

/** On start: retries every live site whose domain is not ready (pending, failed or never provisioned). */
export async function initDomains(logger: FastifyBaseLogger): Promise<void> {
  log = logger
  if (!provisioningEnabled) return
  const todo = await projects
    .find({ status: 'live', 'domain.status': { $ne: 'ready' } }, { projection: { name: 1 } })
    .toArray()
  for (const project of todo) provisionDomain(project)
}
