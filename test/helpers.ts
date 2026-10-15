import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createApp, type Services } from '../src/app'
import { FakeCompaniesHouse } from '../src/companies-house'
import type { Config } from '../src/config'
import { fileFunding } from '../src/funding/source'
import { FakeNotify } from '../src/notify'
import { FakePostcodes } from '../src/postcodes'
import { MemoryStore } from '../src/session'

export interface TestServer {
  baseUrl: string
  close: () => void
}

// Uses made-up Companies House and postcode data, and a fake Notify, so
// tests never call the real services, the example funding schemes, and
// keeps answers in memory.
export async function startServer (config: Partial<Config> = {}, services: Partial<Services> = {}): Promise<TestServer> {
  const app = createApp(
    { port: 0, production: false, sessionSecret: 'test-session-secret', ...config },
    { companiesHouse: new FakeCompaniesHouse(), postcodes: new FakePostcodes(), funding: fileFunding(), notify: new FakeNotify(), sessions: new MemoryStore(), ...services }
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

  cookie (name: string): string | undefined {
    return this.cookies.get(name)
  }

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

// Answers every question for EXAMPLE BAKERY LIMITED in Manchester.
export async function answerEverything (b: Browser, matchFunding = 'yes'): Promise<void> {
  for (const [path, form] of [
    ['/business-name', 'companyName=example'],
    ['/select-business', 'companyNumber=00000001'],
    ['/confirm-business', ''],
    ['/registered-address', 'useRegisteredAddress=yes'],
    ['/confirm-area', ''],
    ['/sector', 'sectors=manufacturing'],
    ['/purpose', 'purposes=equipment&purposes=energy'],
    ['/amount', 'amounts=10k-to-25k'],
    ['/timeframe', 'timeframe=1-to-3-months'],
    ['/match-funding', `matchFunding=${matchFunding}`],
    ...(matchFunding === 'yes' ? [] : [['/equity', 'equity=yes']])
  ]) {
    const res = await b.post(path, new URLSearchParams(form))
    assert.equal(res.status, 302, path)
  }
}
