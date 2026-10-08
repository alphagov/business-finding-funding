import express, { type Request, type Router } from 'express'
import { isCompanyNumber, type CompaniesHouse } from '../companies-house'
import { normalisePostcode, type PostcodeLookup } from '../postcodes'
import { session } from '../session'
import { companyStatus, formatDate, linesHtml, tradingHistory } from './format'

interface JourneyOptions {
  companiesHouse: CompaniesHouse
  postcodes: PostcodeLookup
  sessionSecret?: string
  production: boolean
}

const MAX_SEARCH_LENGTH = 160

const PAGES = ['/business-name', '/select-business', '/confirm-business', '/registered-address', '/postcode', '/confirm-area', '/answers']

function field (req: Request, name: string): string {
  const value = (req.body as Record<string, unknown> | undefined)?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

// The questions about the business and where it wants funding. Each page
// sends the visitor back to the start of the journey if an earlier answer
// it depends on is missing, for example after the cookie has expired.
export function journeyRoutes ({ companiesHouse, postcodes, sessionSecret, production }: JourneyOptions): Router {
  const router = express.Router()

  router.use(PAGES, session({ secret: sessionSecret, production }), express.urlencoded({ extended: false }))

  // What is your company called?

  router.get('/business-name', (req, res) => {
    res.render('journey/business-name', { backLink: '/', value: req.session.answers.companySearch })
  })

  router.post('/business-name', (req, res) => {
    const value = field(req, 'companyName')
    let error

    if (!value) error = 'Enter your company name'
    else if (value.length > MAX_SEARCH_LENGTH) error = `Company name must be ${MAX_SEARCH_LENGTH} characters or less`

    if (error) {
      return res.status(400).render('journey/business-name', { backLink: '/', value, error: { text: error, href: '#companyName' } })
    }

    req.session.save({ ...req.session.answers, companySearch: value })
    res.redirect('/select-business')
  })

  // Choose your company from the Companies House search results

  async function searchResultsPage (req: Request, error?: string): Promise<{ view: string, locals: object }> {
    const term = req.session.answers.companySearch ?? ''
    const results = await companiesHouse.search(term)

    return {
      view: 'journey/select-business',
      locals: {
        backLink: '/business-name',
        term,
        results,
        value: req.session.answers.company?.number,
        error: error && { text: error, href: '#companyNumber' }
      }
    }
  }

  router.get('/select-business', async (req, res) => {
    if (!req.session.answers.companySearch) return res.redirect('/business-name')
    const { view, locals } = await searchResultsPage(req)
    res.render(view, locals)
  })

  router.post('/select-business', async (req, res) => {
    if (!req.session.answers.companySearch) return res.redirect('/business-name')

    const number = field(req, 'companyNumber')
    const company = isCompanyNumber(number) ? await companiesHouse.getCompany(number) : undefined

    if (!company) {
      const { view, locals } = await searchResultsPage(req, 'Select your company')
      return res.status(400).render(view, locals)
    }

    // A different company means the later answers no longer apply.
    const { answers } = req.session
    req.session.save(answers.company?.number === company.number
      ? { ...answers, company }
      : { companySearch: answers.companySearch, company })
    res.redirect('/confirm-business')
  })

  // Check these are the right company details

  router.get('/confirm-business', (req, res) => {
    const { company } = req.session.answers
    if (!company) return res.redirect('/business-name')

    res.render('journey/confirm-business', {
      backLink: '/select-business',
      company,
      status: companyStatus(company.status),
      tradingHistory: company.incorporatedOn && tradingHistory(company.incorporatedOn),
      incorporatedOn: company.incorporatedOn && formatDate(company.incorporatedOn),
      addressHtml: linesHtml(company.addressLines)
    })
  })

  router.post('/confirm-business', (req, res) => {
    const { company } = req.session.answers
    if (!company) return res.redirect('/business-name')

    // Companies registered outside the UK have no UK postcode to use.
    res.redirect(company.postcode && normalisePostcode(company.postcode) ? '/registered-address' : '/postcode')
  })

  // Do you want to use your registered address to find funding?

  function registeredAddressPage (req: Request): object {
    const company = req.session.answers.company!
    return {
      backLink: '/confirm-business',
      addressHtml: linesHtml(company.addressLines),
      value: req.session.answers.useRegisteredAddress
    }
  }

  router.get('/registered-address', (req, res) => {
    const { company } = req.session.answers
    if (!company?.postcode) return res.redirect('/business-name')
    res.render('journey/registered-address', registeredAddressPage(req))
  })

  router.post('/registered-address', async (req, res) => {
    const { answers } = req.session
    if (!answers.company?.postcode) return res.redirect('/business-name')

    const choice = field(req, 'useRegisteredAddress')

    if (choice !== 'yes' && choice !== 'no') {
      return res.status(400).render('journey/registered-address', {
        ...registeredAddressPage(req),
        error: { text: 'Select yes if you want to use this address to find funding', href: '#useRegisteredAddress' }
      })
    }

    const area = choice === 'yes' ? await postcodes.find(answers.company.postcode) : undefined

    if (!area) {
      // If the registered postcode cannot be found, ask for one instead.
      req.session.save({ ...answers, useRegisteredAddress: false, area: answers.useRegisteredAddress === false ? answers.area : undefined })
      return res.redirect('/postcode')
    }

    req.session.save({ ...answers, useRegisteredAddress: true, area })
    res.redirect('/confirm-area')
  })

  // Where do you want to find funding?

  function postcodeBackLink (req: Request): string {
    const postcode = req.session.answers.company?.postcode
    return postcode && normalisePostcode(postcode) ? '/registered-address' : '/confirm-business'
  }

  router.get('/postcode', (req, res) => {
    const { company, useRegisteredAddress, area } = req.session.answers
    if (!company) return res.redirect('/business-name')

    res.render('journey/postcode', {
      backLink: postcodeBackLink(req),
      value: useRegisteredAddress ? undefined : area?.postcode
    })
  })

  router.post('/postcode', async (req, res) => {
    const { answers } = req.session
    if (!answers.company) return res.redirect('/business-name')

    const value = field(req, 'postcode')
    const postcode = normalisePostcode(value)
    let error

    if (!value) error = 'Enter a postcode'
    else if (!postcode) error = 'Enter a full UK postcode, like SW1A 1AA'

    const area = postcode ? await postcodes.find(postcode) : undefined
    if (postcode && !area) error = 'Enter a real postcode'

    if (error || !area) {
      return res.status(400).render('journey/postcode', {
        backLink: postcodeBackLink(req),
        value,
        error: { text: error, href: '#postcode' }
      })
    }

    req.session.save({ ...answers, useRegisteredAddress: false, area })
    res.redirect('/confirm-area')
  })

  // Confirm the local authority area

  router.get('/confirm-area', (req, res) => {
    const { area, useRegisteredAddress } = req.session.answers
    if (!area) return res.redirect('/business-name')

    res.render('journey/confirm-area', {
      backLink: useRegisteredAddress ? '/registered-address' : '/postcode',
      area
    })
  })

  router.post('/confirm-area', (req, res) => {
    if (!req.session.answers.area) return res.redirect('/business-name')
    res.redirect('/answers')
  })

  // Answers so far. This will become the check your answers page once the
  // rest of the questions are built.

  router.get('/answers', (req, res) => {
    const { company, area, useRegisteredAddress } = req.session.answers
    if (!company || !area) return res.redirect('/business-name')

    res.render('journey/answers', {
      backLink: '/confirm-area',
      company,
      area,
      areaChangeLink: useRegisteredAddress ? '/registered-address' : '/postcode'
    })
  })

  return router
}
