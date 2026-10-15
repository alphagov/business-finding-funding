import express, { type Request, type RequestHandler, type Router } from 'express'
import { formatDate } from '../journey/format'
import { CHECK_ANSWERS, canVisit, nextPath } from '../journey/steps'
import { card, HEADINGS } from './format'
import { findFunding } from './match'
import { decryptAnswers, encryptAnswers, LINK_DAYS, linkExpiry } from './results-link'
import type { FundingType, Scheme } from './schemes'
import type { FundingSource } from './source'
import { NotifyError, type Notify } from '../notify'

interface ResultsEmail {
  notify: Notify
  templateId?: string
  // Where the emailed link points. Taken from the request when running locally.
  serviceUrl?: string
  secret?: string
  production: boolean
}

interface FundingOptions {
  funding: FundingSource
  session: RequestHandler
  resultsEmail: ResultsEmail
}

const PAGES = ['/results', '/shortlist', '/save-results']

function isEmailAddress (value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function serviceUrl (req: Request, { serviceUrl, production }: ResultsEmail): string {
  if (serviceUrl) return serviceUrl
  if (production) throw new Error('SERVICE_URL is not set')
  return `${req.protocol}://${req.get('host')}`
}

function shortlistOf (req: Request): string[] {
  return req.session.answers.shortlist ?? []
}

// The funding results and the shortlist. Both need every question answered.
export function fundingRoutes ({ funding, session, resultsEmail }: FundingOptions): Router {
  const router = express.Router()

  router.use(PAGES, session, express.urlencoded({ extended: false }), (req, res, next) => {
    if (canVisit(CHECK_ANSWERS, req.session.answers)) return next()
    res.redirect(nextPath(req.session.answers))
  })

  router.get('/results', async (req, res) => {
    const { example, schemes } = await funding.get()
    const shortlist = shortlistOf(req)

    res.render('funding/results', {
      backLink: CHECK_ANSWERS,
      example,
      company: req.session.answers.company,
      shortlistCount: shortlist.length,
      groups: findFunding(schemes, req.session.answers).map((result) => ({
        ...HEADINGS[result.type],
        mostRelevant: result.mostRelevant.map((scheme) => card(scheme, shortlist, 'most-relevant')),
        possibleFit: result.possibleFit.map((scheme) => card(scheme, shortlist, 'possible-fit'))
      }))
    })
  })

  router.get('/shortlist', async (req, res) => {
    const { example, schemes: all } = await funding.get()
    const shortlist = shortlistOf(req)
    const schemes = shortlist.map((id) => all.find((scheme) => scheme.id === id)).filter((scheme): scheme is Scheme => Boolean(scheme))

    res.render('funding/shortlist', {
      backLink: '/results',
      example,
      groups: (['loan', 'grant', 'equity'] as FundingType[])
        .map((type) => ({ ...HEADINGS[type], cards: schemes.filter((s) => s.type === type).map((s) => card(s, shortlist)) }))
        .filter((group) => group.cards.length > 0)
    })
  })

  // Adds or removes a scheme, then goes back to where the button was.
  router.post('/shortlist', async (req, res) => {
    const { schemes } = await funding.get()
    const body = req.body as Record<string, unknown>
    const id = schemes.some((scheme) => scheme.id === body.scheme) ? body.scheme as string : undefined
    const returnTo = body.returnTo === '/shortlist' ? '/shortlist' : '/results'

    if (id) {
      const shortlist = shortlistOf(req).filter((item) => item !== id)
      if (body.action === 'add') shortlist.push(id)
      await req.session.save({ ...req.session.answers, shortlist })
    }
    res.redirect(id && returnTo === '/results' ? `${returnTo}#${id}` : returnTo)
  })

  router.get('/save-results', (req, res) => {
    res.render('funding/save-results', { backLink: '/results', company: req.session.answers.company, linkDays: LINK_DAYS })
  })

  // Emails a link that brings back the answers and shortlist. The email
  // address is only passed to Notify, never stored.
  router.post('/save-results', async (req, res) => {
    const body = req.body as Record<string, unknown>
    const emailAddress = typeof body.email === 'string' ? body.email.trim() : ''
    const page = (text: string, status = 400): void => {
      res.status(status).render('funding/save-results', {
        backLink: '/results',
        company: req.session.answers.company,
        linkDays: LINK_DAYS,
        value: emailAddress,
        error: { text, href: '#email' }
      })
    }

    if (!emailAddress) return page('Enter your email address')
    if (!isEmailAddress(emailAddress)) return page('Enter an email address in the correct format, like name@example.com')

    try {
      const expires = linkExpiry()
      const token = encryptAnswers(req.session.answers, resultsEmail.secret ?? '', expires)
      const expiryDate = formatDate(expires.toISOString().slice(0, 10))

      await resultsEmail.notify.sendEmail({
        templateId: resultsEmail.templateId ?? '',
        emailAddress,
        personalisation: {
          business_name: req.session.answers.company?.name ?? 'your business',
          link: `${serviceUrl(req, resultsEmail)}/saved-results/${token}`,
          expiry_date: expiryDate
        }
      })

      res.render('funding/save-results-sent', { emailAddress, expiryDate })
    } catch (err) {
      if (err instanceof NotifyError && err.trialMode) {
        console.warn(err.message)
        return page('This is a trial, so we can only send emails to people in the GOV.UK Notify team', 503)
      }
      console.error(err)
      page('Sorry, we could not send the email. Try again later.', 503)
    }
  })

  // Where the emailed link goes. Brings back the answers, then shows the results.
  router.get('/saved-results/:token', session, async (req, res) => {
    const answers = decryptAnswers(String(req.params.token), resultsEmail.secret ?? '')

    if (!answers) return res.status(404).render('funding/results-link-expired', { linkDays: LINK_DAYS })
    await req.session.save(answers)
    res.redirect('/results')
  })

  return router
}
