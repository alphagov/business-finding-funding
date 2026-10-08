import type { AddressInfo } from 'node:net'
import { createApp, type Services } from '../src/app'
import { FakeCompaniesHouse } from '../src/companies-house'
import type { Config } from '../src/config'
import { loadFunding } from '../src/funding/schemes'
import { FakePostcodes } from '../src/postcodes'

export interface TestServer {
  baseUrl: string
  close: () => void
}

// Uses made-up Companies House and postcode data so tests never call the
// real services, and the example funding schemes.
export async function startServer (config: Partial<Config> = {}, services: Partial<Services> = {}): Promise<TestServer> {
  const app = createApp(
    { port: 0, production: false, sessionSecret: 'test-session-secret', ...config },
    { companiesHouse: new FakeCompaniesHouse(), postcodes: new FakePostcodes(), funding: loadFunding(), ...services }
  )
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close()
  }
}

// Makes requests like a browser would, keeping cookies between them.
export class Browser {
  private readonly cookies = new Map<string, string>()

  constructor (private readonly baseUrl: string) {}

  get (path: string): Promise<Response> {
    return this.request(path)
  }

  post (path: string, form: Record<string, string> | URLSearchParams = {}): Promise<Response> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form)
    })
  }

  private async request (path: string, init: RequestInit = {}): Promise<Response> {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers as Record<string, string>, Cookie: cookie },
      redirect: 'manual'
    })

    for (const header of res.headers.getSetCookie()) {
      const [name, ...value] = header.split(';')[0].split('=')
      this.cookies.set(name, value.join('='))
    }
    return res
  }
}
