import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { serverConfig } from '../../server/config'
import { registerRoutes } from '../../server/routes'
import { captureRawBody } from '../../server/security/helperAuth'
import { chatCreated, closeServer, createService, listen, restoreConfig } from '../helpers/integration'

function signedHeaders(method: string, path: string, body: string): Record<string, string> {
  const timestamp = new Date().toISOString()
  const signature = createHmac('sha256', 'test-secret')
    .update([timestamp, method, path, body].join('\n'))
    .digest('hex')

  return {
    'Content-Type': 'application/json',
    'X-DCR-Helper-Id': 'helper-demo',
    'X-DCR-Timestamp': timestamp,
    'X-DCR-Signature': signature
  }
}

describe('helper to central route authorization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    restoreConfig()
    serverConfig.nodeRole = 'central'
    serverConfig.nodeId = 'central-demo'
    serverConfig.helperSharedSecret = 'test-secret'
    serverConfig.trustedHelperIds = ['helper-demo']
    serverConfig.helperSignatureToleranceSeconds = 300
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreConfig()
  })

  it('rejects unsigned helper sync requests and accepts signed ones', async () => {
    const central = createService('central')
    const app = express()
    app.use(express.json({ verify: captureRawBody }))
    registerRoutes(app, central.service)
    
    const httpServer = createServer(app)
    const port = await listen(httpServer)
    const baseUrl = `http://127.0.0.1:${port}`
    const body = JSON.stringify({
      sourceNodeId: 'helper-demo',
      events: [chatCreated({ eventId: 'helper-demo:event-1' })]
    })

    try {
      const unsigned = await fetch(`${baseUrl}/api/sync/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      expect(unsigned.status).toBe(401)

      const signed = await fetch(`${baseUrl}/api/sync/events`, {
        method: 'POST',
        headers: signedHeaders('POST', '/api/sync/events', body),
        body
      })
      expect(signed.status).toBe(200)
      
      const json = await signed.json() as { accepted: string[] }
      expect(json.accepted).toContain('helper-demo:event-1')
    } finally {
      await closeServer(httpServer)
      central.db.close()
    }
  })

  it('allows unsigned browser/demo routes while protecting helper sync routes', async () => {
    const central = createService('central')
    const app = express()
    app.use(express.json({ verify: captureRawBody }))
    registerRoutes(app, central.service)

    const httpServer = createServer(app)
    const port = await listen(httpServer)
    const baseUrl = `http://127.0.0.1:${port}`
    const event = chatCreated({ eventId: 'browser-demo:event-1' })

    try {
      const config = await fetch(`${baseUrl}/api/config`)
      expect(config.status).toBe(200)

      const users = await fetch(`${baseUrl}/api/users`)
      expect(users.status).toBe(200)

      const published = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-user-id': 'u-denis'
        },
        body: JSON.stringify(event)
      })
      expect(published.status).toBe(201)

      const unsignedSync = await fetch(`${baseUrl}/api/sync/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceNodeId: 'browser-demo',
          events: [chatCreated({ eventId: 'browser-demo:event-2' })]
        })
      })
      expect(unsignedSync.status).toBe(401)
    } finally {
      await closeServer(httpServer)
      central.db.close()
    }
  })
})
