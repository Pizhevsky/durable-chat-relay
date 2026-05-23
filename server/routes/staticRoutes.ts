import type { Express } from 'express'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function registerStaticRoutes(app: Express): void {
  app.get('/worker.js', (_request, response) => {
    const builtWorker = resolve(process.cwd(), 'dist/client/worker.js')
    const sourceWorker = resolve(process.cwd(), 'client/worker.js')
    const workerPath = existsSync(builtWorker) ? builtWorker : sourceWorker
    const worker = readFileSync(workerPath, 'utf8')
    response.type('text/javascript').send(worker)
  })
}
