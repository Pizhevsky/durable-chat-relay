import type { ChatEvent, SyncPullResponse, SyncResponse } from '../../shared/types.js'
import { signCentralRequest } from '../security/helperAuth.js'

export class CentralSyncClient {
  constructor(private readonly centralUrl: string) {}

  async pushEvents(sourceNodeId: string, events: ChatEvent[]): Promise<SyncResponse> {
    const url = new URL(`${this.centralUrl}/api/sync/events`)
    const body = JSON.stringify({ sourceNodeId, events })
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signCentralRequest('POST', url, body)
      },
      body
    })

    if (!response.ok) throw new Error(`Central push failed: ${response.status}`)

    return response.json() as Promise<SyncResponse>
  }

  async pullEvents(since: number, limit: number): Promise<SyncPullResponse> {
    const url = new URL(`${this.centralUrl}/api/sync/events`)
    url.searchParams.set('since', String(since))
    url.searchParams.set('limit', String(limit))

    const response = await fetch(url.toString(), {
      headers: signCentralRequest('GET', url)
    })

    if (!response.ok) throw new Error(`Central pull failed: ${response.status}`)

    return response.json() as Promise<SyncPullResponse>
  }
}
