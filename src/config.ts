export interface Config {
  port: number
  production: boolean
  sitePassword?: string
}

// All settings come from environment variables, read in one place, so the
// app can move between hosting platforms without code changes.
export function loadConfig (env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 3000,
    production: env.NODE_ENV === 'production',
    sitePassword: env.SITE_PASSWORD || undefined
  }
}
