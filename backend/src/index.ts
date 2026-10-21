import { buildApp } from './app.js'
import { config } from './config.js'
import { closeDb, connectDb } from './db.js'
import { initDomains } from './domains.js'

await connectDb()
const app = await buildApp()

const shutdown = async () => {
  await app.close()
  await closeDb()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ host: config.HOST, port: config.PORT })
await initDomains(app.log)
app.log.info(`Sitios publicados en <nombre>.${config.sitesDomain}`)
