import path from 'node:path'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import nunjucks from 'nunjucks'
import type { Config } from './config'
import { info } from './info'
import { passwordProtection } from './password'

const govukFrontendDist = path.join(path.dirname(require.resolve('govuk-frontend/package.json')), 'dist')

// views/ sits one level above both src/ and the compiled dist/.
const viewsDir = path.join(__dirname, '..', 'views')

export function createApp (config: Config): Express {
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

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/info', (req, res) => {
    res.json(info())
  })

  app.get('/', (req, res) => {
    res.render('index')
  })

  app.use((req, res) => {
    res.status(404).render('404')
  })

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).render('500')
  })

  return app
}
