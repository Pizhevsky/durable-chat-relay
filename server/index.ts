import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Server } from 'socket.io'
import { createDatabase } from './db/database.js'
import { serverConfig } from './config.js'
import { ChatEventService } from './services/ChatEventService.js'
import { registerRoutes } from './routes.js'
import { registerSocketHandlers } from './socket/registerSocket.js'
import { startHelperSync } from './sync/helperSync.js'

const db = createDatabase(serverConfig.databasePath)
const service = new ChatEventService(db, serverConfig.nodeRole)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

app.use(cors())
app.use(express.json({ limit: '2mb' }))

registerRoutes(app, service)
const socketEvents = registerSocketHandlers(io, service)
startHelperSync(service, socketEvents.emitAppliedEvent)

const clientDistPath = resolve(process.cwd(), 'dist/client')
const clientIndexPath = resolve(clientDistPath, 'index.html')

if (existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath))
  app.get(/^(?!\/api\/)(?!\/socket\.io\/)(?!\/worker\.js).*/, (_request, response) => {
    response.sendFile(clientIndexPath)
  })
}

httpServer.listen(serverConfig.port, '0.0.0.0', () => {
  console.log(`[${serverConfig.nodeRole}] ${serverConfig.nodeId} listening on http://localhost:${serverConfig.port}`)
  console.log(`[${serverConfig.nodeRole}] SQLite database: ${serverConfig.databasePath}`)
  if (serverConfig.nodeRole === 'helper') {
    console.log(`[helper] central target: ${serverConfig.centralUrl ?? 'not configured'}`)
  }
})

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[${serverConfig.nodeRole}] ${signal} received, closing SQLite database`)
  httpServer.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } finally {
      process.exit(0)
    }
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
