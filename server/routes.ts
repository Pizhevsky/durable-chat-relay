import type { Express, Request, Response, NextFunction } from 'express'
import { toHttpError } from './errors.js'
import type { ChatEventService } from './services/ChatEventService.js'
import { registerClientRoutes } from './routes/clientRoutes.js'
import { registerRecoveryRoutes } from './routes/recoveryRoutes.js'
import { registerStaticRoutes } from './routes/staticRoutes.js'
import { registerSyncRoutes } from './routes/syncRoutes.js'

export function registerRoutes(app: Express, service: ChatEventService): void {
  registerClientRoutes(app, service)
  registerSyncRoutes(app, service)
  registerRecoveryRoutes(app, service)
  registerStaticRoutes(app)

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const httpError = toHttpError(error)
    response.status(httpError.statusCode).json(httpError)
  })
}
