import express, { type Request, type RequestHandler, type Router } from 'express'
import { CHECK_ANSWERS, canVisit, nextPath } from '../journey/steps'
import { card, HEADINGS } from './format'
import { findFunding } from './match'
import type { FundingData, FundingType, Scheme } from './schemes'

interface FundingOptions {
  funding: FundingData
  session: RequestHandler
}

const PAGES = ['/results', '/shortlist']

function shortlistOf (req: Request): string[] {
  return req.session.answers.shortlist ?? []
}

// The funding results and the shortlist. Both need every question answered.
export function fundingRoutes ({ funding, session }: FundingOptions): Router {
  const router = express.Router()
  const byId = new Map(funding.schemes.map((scheme) => [scheme.id, scheme]))

  router.use(PAGES, session, express.urlencoded({ extended: false }), (req, res, next) => {
    if (canVisit(CHECK_ANSWERS, req.session.answers)) return next()
    res.redirect(nextPath(req.session.answers))
  })

  router.get('/results', (req, res) => {
    const shortlist = shortlistOf(req)

    res.render('funding/results', {
      backLink: CHECK_ANSWERS,
      example: funding.example,
      company: req.session.answers.company,
      shortlistCount: shortlist.length,
      groups: findFunding(funding.schemes, req.session.answers).map((result) => ({
        ...HEADINGS[result.type],
        mostRelevant: result.mostRelevant.map((scheme) => card(scheme, shortlist, 'most-relevant')),
        possibleFit: result.possibleFit.map((scheme) => card(scheme, shortlist, 'possible-fit'))
      }))
    })
  })

  router.get('/shortlist', (req, res) => {
    const shortlist = shortlistOf(req)
    const schemes = shortlist.map((id) => byId.get(id)).filter((scheme): scheme is Scheme => Boolean(scheme))

    res.render('funding/shortlist', {
      backLink: '/results',
      example: funding.example,
      groups: (['loan', 'grant', 'equity'] as FundingType[])
        .map((type) => ({ ...HEADINGS[type], cards: schemes.filter((s) => s.type === type).map((s) => card(s, shortlist)) }))
        .filter((group) => group.cards.length > 0)
    })
  })

  // Adds or removes a scheme, then goes back to where the button was.
  router.post('/shortlist', (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = typeof body.scheme === 'string' && byId.has(body.scheme) ? body.scheme : undefined
    const returnTo = body.returnTo === '/shortlist' ? '/shortlist' : '/results'

    if (id) {
      const shortlist = shortlistOf(req).filter((item) => item !== id)
      if (body.action === 'add') shortlist.push(id)
      req.session.save({ ...req.session.answers, shortlist })
    }
    res.redirect(id && returnTo === '/results' ? `${returnTo}#${id}` : returnTo)
  })

  return router
}
