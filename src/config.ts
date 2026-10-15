export interface Config {
  port: number
  production: boolean
  sitePassword?: string
  sessionSecret?: string
  companiesHouseApiKey?: string
  notifyApiKey?: string
  notifyResultsTemplateId?: string
  serviceUrl?: string
  fundingApiUrl?: string
}

// All settings come from environment variables, read in one place, so the
// app can move between hosting platforms without code changes.
export function loadConfig (env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 3000,
    production: env.NODE_ENV === 'production',
    sitePassword: env.SITE_PASSWORD || undefined,
    sessionSecret: env.SESSION_SECRET || undefined,
    companiesHouseApiKey: env.COMPANIES_HOUSE_API_KEY || undefined,
    notifyApiKey: env.NOTIFY_API_KEY || undefined,
    notifyResultsTemplateId: env.NOTIFY_RESULTS_TEMPLATE_ID || undefined,
    // Without a trailing slash, for example https://www.example.gov.uk
    serviceUrl: env.SERVICE_URL?.replace(/\/+$/, '') || undefined,
    // The funding data API, without a trailing slash. Leave out to use the
    // data file in this repository.
    fundingApiUrl: env.FUNDING_API_URL?.replace(/\/+$/, '') || undefined
  }
}
