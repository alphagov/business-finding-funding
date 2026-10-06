import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app'
import type { Config } from '../src/config'

export interface TestServer {
  baseUrl: string
  close: () => void
}

export async function startServer (config: Partial<Config> = {}): Promise<TestServer> {
  const app = createApp({ port: 0, production: false, ...config })
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close()
  }
}
