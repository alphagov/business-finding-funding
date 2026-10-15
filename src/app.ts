import crypto from 'node:crypto'
import path from 'node:path'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import nunjucks from 'nunjucks'
import { CompaniesHouseApi, FakeCompaniesHouse, missingCompaniesHouse, type CompaniesHouse } from './companies-house'
import type { Config } from './config'
import { fundingRoutes } from './funding/routes'
import { fileFunding, FundingApi, type FundingSource } from './funding/source'
import { info } from './info'
import { journeyRoutes } from './journey/routes'
import { FakeNotify, missingNotify, NotifyApi, type Notify } from './notify'
import { passwordProtection } from './password'
import { PostcodesIo, type PostcodeLookup } from './postcodes'
import { MemoryStore, redisStore, session, type SessionStore } from './session'

const govukFrontendDist = path.join(path.dirname(require.resolve('govuk-frontend/package.json')), 'dist')

// views/ sits one level above both src/ and the compiled dist/.
const viewsDir = path.join(__dirname, '..', 'views')

export interface Services {
  companiesHouse: CompaniesHouse
  postcodes: PostcodeLookup
  funding: FundingSource
  notify: Notify
  // Undefined in production if REDIS_URL is not set.
  sessions?: SessionStore
}

// Uses made-up Companies House data, and does not send emails, when running
// locally without API keys. Reads the funding schemes from the funding data
// API when FUNDING_API_URL is set, and from the data file otherwise. Keeps
// answers in memory when running locally without Redis.
export function createServices (config: Config): Services {
  let companiesHouse: CompaniesHouse

  if (config.companiesHouseApiKey) {
    companiesHouse = new CompaniesHouseApi(config.companiesHouseApiKey)
  } else if (config.production) {
    companiesHouse = missingCompaniesHouse
  } else {
    console.warn('COMPANIES_HOUSE_API_KEY is not set, so made-up companies will be used')
    companiesHouse = new FakeCompaniesHouse()
  }

  let notify: Notify

  if (config.notifyApiKey) {
    notify = new NotifyApi(config.notifyApiKey)
  } else if (config.production) {
    notify = missingNotify
  } else {
    console.warn('NOTIFY_API_KEY is not set, so emails will not be sent')
    notify = new FakeNotify(true)
  }

  const funding = config.fundingApiUrl ? new FundingApi(config.fundingApiUrl) : fileFunding()

  let sessions: SessionStore | undefined

  if (config.redisUrl) {
    sessions = redisStore(config.redisUrl)
  } else if (!config.production) {
    console.warn('REDIS_URL is not set, so answers will be kept in memory and lost when the app restarts')
    sessions = new MemoryStore()
  }

  return { companiesHouse, postcodes: new PostcodesIo(), funding, notify, sessions }
}

// Locally, a missing SESSION_SECRET is made up when the app starts, so
// answers and emailed links stop working when it restarts.
function sessionSecret (config: Config): string | undefined {
  if (config.sessionSecret || config.production) return config.sessionSecret
  console.warn('SESSION_SECRET is not set, so answers will be lost when the app restarts')
  return crypto.randomBytes(32).toString('hex')
}

export function createApp (config: Config, services: Services = createServices(config)): Express {
  const app = express()

  app.disable('x-powered-by')

  nunjucks.configure([viewsDir, govukFrontendDist], {
    autoescape: true,
    express: app,
    noCache: !config.production
  })
  app.set('view engine', 'njk')

  // This is an experiment, so keep it out of search results.
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  // Heroku ends HTTPS at its router, so trust its X-Forwarded-Proto header
  // and send any plain HTTP requests to HTTPS.
  if (config.production) {
    app.set('trust proxy', 1)
    app.use((req, res, next) => {
      if (req.secure) return next()
      res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
    })
  }

  app.use(passwordProtection({ password: config.sitePassword, production: config.production }))

  app.use('/assets', express.static(path.join(govukFrontendDist, 'govuk', 'assets')))

  for (const file of ['govuk-frontend.min.css', 'govuk-frontend.min.js']) {
    app.get(`/assets/${file}`, (req, res) => {
      res.sendFile(path.join(govukFrontendDist, 'govuk', file))
    })
  }

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n')
  })

  // Also checks Redis, so a deploy fails if the app cannot keep answers.
  app.get('/health', async (req, res) => {
    try {
      await services.sessions?.check()
      res.json({ status: 'ok' })
    } catch (err) {
      console.error('Health check failed, because Redis could not be reached:', (err as Error).message)
      res.status(503).json({ status: 'error' })
    }
  })

  app.get('/info', (req, res) => {
    res.json(info())
  })

  app.get('/', (req, res) => {
    res.render('index')
  })

  const secret = sessionSecret(config)
  const answers = session({ store: services.sessions, secret, production: config.production })
  app.use(journeyRoutes({ ...services, session: answers }))
  app.use(fundingRoutes({
    funding: services.funding,
    session: answers,
    resultsEmail: {
      notify: services.notify,
      templateId: config.notifyResultsTemplateId,
      serviceUrl: config.serviceUrl,
      secret,
      production: config.production
    }
  }))

  app.use((req, res) => {
    res.status(404).render('404')
  })

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).render('500')
  })

  return app
}
