import fs from 'node:fs'
import path from 'node:path'

export interface Info {
  version: string
  node: string
  stack: string | null
  operatingSystem: string | null
  dyno: string | null
  startedAt: string
  uptimeSeconds: number
}

// package.json sits one level above both src/ and the compiled dist/.
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }

const startedAt = new Date().toISOString()

// The operating system name, for example "Ubuntu 24.04.3 LTS", shows which
// Heroku stack the app is running on even if STACK is not set.
function readOperatingSystem (): string | null {
  try {
    const match = fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]*)"?$/m)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

const operatingSystem = readOperatingSystem()

export function info (): Info {
  return {
    version,
    node: process.version,
    stack: process.env.STACK || null,
    operatingSystem,
    dyno: process.env.DYNO || null,
    startedAt,
    uptimeSeconds: Math.round(process.uptime())
  }
}
