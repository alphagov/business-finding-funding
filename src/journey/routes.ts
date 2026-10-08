import express, { type Request, type RequestHandler, type Response, type Router } from 'express'
import { isCompanyNumber, type CompaniesHouse } from '../companies-house'
import { normalisePostcode, type Area, type PostcodeLookup } from '../postcodes'
import type { Answers } from './answers'
import { companyStatus, formatDate, linesHtml, tradingHistory } from './format'
import { AMOUNTS, PURPOSES, QUESTIONS, TIMEFRAMES, YES_NO_NOT_SURE, label, validate, type ChoiceQuestion, type Option } from './questions'
import { SECTORS } from './sectors'
import { CHECK_ANSWERS, JOURNEY_PATHS, canVisit, nextPath, previousPath, tidy } from './steps'

interface JourneyOptions {
  companiesHouse: CompaniesHouse
  postcodes: PostcodeLookup
  session: RequestHandler
}

const MAX_SEARCH_LENGTH = 160

function field (req: Request, name: string): string {
  const value = (req.body as Record<string, unknown> | undefined)?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

// Checkboxes send one value, several values or none.
function fieldList (req: Request, name: string): string[] {
  const value = (req.body as Record<string, unknown> | undefined)?.[name]
  const values = Array.isArray(value) ? value : [value]
  return values.filter((item): item is string => typeof item === 'string' && item !== '')
}

function save (req: Request, answers: Answers): void {
  req.session.save(tidy(answers))
}

// Moves on to the next question that has not been answered, which is the
// check answers page if everything has been.
function next (req: Request, res: Response): void {
  res.redirect(nextPath(req.session.answers))
}

// A new funding area means the premises question, which names the area,
// needs answering again.
function withArea (answers: Answers, area: Area | undefined): Answers {
  if (area?.postcode === answers.area?.postcode) return answers
  return { ...answers, area, areaConfirmed: false, premisesInArea: undefined }
}

export function journeyRoutes ({ companiesHouse, postcodes, session }: JourneyOptions): Router {
  const router = express.Router()

  // Every page sends the visitor to the right question if they have skipped
  // ahead, or if their answers have been lost, for example after closing
  // the browser.
  router.use(JOURNEY_PATHS, session, express.urlencoded({ extended: false }), (req, res, next) => {
    if (canVisit(req.baseUrl, req.session.answers)) return next()
    res.redirect(nextPath(req.session.answers))
  })

  function back (req: Request): string {
    return previousPath(req.baseUrl || req.path, req.session.answers)
  }

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

    save(req, { ...req.session.answers, companySearch: value })
    res.redirect('/select-business')
  })

  // Choose your company from the Companies House search results

  async function searchResultsPage (req: Request, error?: string): Promise<object> {
    const term = req.session.answers.companySearch ?? ''

    return {
      backLink: '/business-name',
      term,
      results: await companiesHouse.search(term),
      value: req.session.answers.company?.number,
      error: error && { text: error, href: '#companyNumber' }
    }
  }

  router.get('/select-business', async (req, res) => {
    res.render('journey/select-business', await searchResultsPage(req))
  })

  router.post('/select-business', async (req, res) => {
    const number = field(req, 'companyNumber')
    const company = isCompanyNumber(number) ? await companiesHouse.getCompany(number) : undefined

    if (!company) {
      return res.status(400).render('journey/select-business', await searchResultsPage(req, 'Select your company'))
    }

    // A different company means all the later answers need giving again.
    const { answers } = req.session
    save(req, answers.company?.number === company.number
      ? { ...answers, company }
      : { companySearch: answers.companySearch, company })
    next(req, res)
  })

  // Check these are the right company details

  router.get('/confirm-business', (req, res) => {
    const company = req.session.answers.company!

    res.render('journey/confirm-business', {
      backLink: back(req),
      company,
      status: companyStatus(company.status),
      tradingHistory: company.incorporatedOn && tradingHistory(company.incorporatedOn),
      incorporatedOn: company.incorporatedOn && formatDate(company.incorporatedOn),
      addressHtml: linesHtml(company.addressLines)
    })
  })

  router.post('/confirm-business', (req, res) => {
    save(req, { ...req.session.answers, companyConfirmed: true })
    next(req, res)
  })

  // Do you want to use your registered address to find funding?

  function registeredAddressPage (req: Request): object {
    return {
      backLink: back(req),
      addressHtml: linesHtml(req.session.answers.company!.addressLines),
      value: req.session.answers.useRegisteredAddress
    }
  }

  router.get('/registered-address', (req, res) => {
    res.render('journey/registered-address', registeredAddressPage(req))
  })

  router.post('/registered-address', async (req, res) => {
    const { answers } = req.session
    const choice = field(req, 'useRegisteredAddress')

    if (choice !== 'yes' && choice !== 'no') {
      return res.status(400).render('journey/registered-address', {
        ...registeredAddressPage(req),
        error: { text: 'Select yes if you want to use this address to find funding', href: '#useRegisteredAddress' }
      })
    }

    const useRegisteredAddress = choice === 'yes'
    if (useRegisteredAddress === answers.useRegisteredAddress) return next(req, res)

    // If the registered postcode cannot be found, ask for one instead.
    const area = useRegisteredAddress ? await postcodes.find(answers.company!.postcode!) : undefined
    save(req, withArea({ ...answers, useRegisteredAddress: Boolean(area) }, area))
    next(req, res)
  })

  // Postcode questions, for the funding area and the premises

  interface PostcodePage {
    path: string
    title: string
    label: string
    value: (answers: Answers) => string | undefined
    answer: (answers: Answers, area: Area) => Answers
  }

  function postcodeRoutes (page: PostcodePage): void {
    router.get(page.path, (req, res) => {
      res.render('journey/postcode', { ...page, action: page.path, backLink: back(req), value: page.value(req.session.answers) })
    })

    router.post(page.path, async (req, res) => {
      const value = field(req, 'postcode')
      const postcode = normalisePostcode(value)
      const area = postcode ? await postcodes.find(postcode) : undefined
      let error

      if (!value) error = 'Enter a postcode'
      else if (!postcode) error = 'Enter a full UK postcode, like SW1A 1AA'
      else if (!area) error = 'Enter a real postcode'

      if (error || !area) {
        return res.status(400).render('journey/postcode', {
          ...page,
          action: page.path,
          backLink: back(req),
          value,
          error: { text: error, href: '#postcode' }
        })
      }

      save(req, page.answer(req.session.answers, area))
      next(req, res)
    })
  }

  postcodeRoutes({
    path: '/postcode',
    title: 'Where do you want to find funding?',
    label: 'Postcode of the business premises or area',
    value: (answers) => answers.useRegisteredAddress ? undefined : answers.area?.postcode,
    answer: withArea
  })

  postcodeRoutes({
    path: '/premises-postcode',
    title: 'Where is the property you want to buy or rent?',
    label: 'Postcode of the property or area',
    value: (answers) => answers.premisesArea?.postcode,
    answer: (answers, area) => area.postcode === answers.premisesArea?.postcode
      ? answers
      : { ...answers, premisesArea: area, premisesAreaConfirmed: false }
  })

  // Confirm the local authority for a postcode

  interface ConfirmAreaPage {
    path: string
    changeLink: string
    area: (answers: Answers) => Area
    answer: (answers: Answers) => Answers
  }

  function confirmAreaRoutes (page: ConfirmAreaPage): void {
    router.get(page.path, (req, res) => {
      res.render('journey/confirm-area', {
        action: page.path,
        changeLink: page.changeLink,
        backLink: back(req),
        area: page.area(req.session.answers)
      })
    })

    router.post(page.path, (req, res) => {
      save(req, page.answer(req.session.answers))
      next(req, res)
    })
  }

  confirmAreaRoutes({
    path: '/confirm-area',
    changeLink: '/postcode',
    area: (answers) => answers.area!,
    answer: (answers) => ({ ...answers, areaConfirmed: true })
  })

  confirmAreaRoutes({
    path: '/confirm-premises-area',
    changeLink: '/premises-postcode',
    area: (answers) => answers.premisesArea!,
    answer: (answers) => ({ ...answers, premisesAreaConfirmed: true })
  })

  // Questions answered by choosing from a list

  function questionPage (req: Request, question: ChoiceQuestion, values: string[], error?: string): object {
    const { answers } = req.session

    return {
      backLink: back(req),
      question,
      title: question.title(answers),
      hintHtml: question.hintHtml?.(answers),
      values,
      error: error && { text: error, href: `#${question.answer}` }
    }
  }

  for (const question of QUESTIONS) {
    router.get(question.path, (req, res) => {
      const answer = req.session.answers[question.answer]
      const values = answer === undefined ? question.suggested?.(req.session.answers) ?? [] : [answer].flat()
      res.render('journey/question', questionPage(req, question, values))
    })

    router.post(question.path, (req, res) => {
      const values = fieldList(req, question.answer)
      const error = validate(question, values, req.session.answers)

      if (error) {
        return res.status(400).render('journey/question', questionPage(req, question, values, error))
      }

      save(req, { ...req.session.answers, [question.answer]: question.multiple ? values : values[0] })
      next(req, res)
    })
  }

  // Check your answers

  router.get(CHECK_ANSWERS, (req, res) => {
    const answers = req.session.answers
    const company = answers.company!
    const area = answers.area!

    function labels (options: Option[], values: string[] = []): { html: string } {
      return { html: linesHtml(values.map((value) => label(options, value))) }
    }

    function row (key: string, value: { text: string } | { html: string }, href: string): object {
      return {
        key: { text: key },
        value,
        actions: { items: [{ href, text: 'Change', visuallyHiddenText: key.toLowerCase() }] }
      }
    }

    const premises = answers.premisesInArea === 'no' && answers.premisesArea
      ? `${answers.premisesArea.localAuthority} (${answers.premisesArea.postcode})`
      : area.localAuthority
    const yesNo = (value?: string): { text: string } => ({ text: label(YES_NO_NOT_SURE, value ?? '') })

    res.render('journey/check-answers', {
      backLink: back(req),
      rows: [
        row('Company', { text: `${company.name} (${company.number})` }, '/business-name'),
        row('Funding area', { text: `${area.localAuthority} (${area.postcode})` }, answers.useRegisteredAddress ? '/registered-address' : '/postcode'),
        row('Sector', labels(SECTORS, answers.sectors), '/sector'),
        row('What you’re trying to achieve', labels(PURPOSES, answers.purposes), '/purpose'),
        answers.premisesInArea && row('Property location', { text: premises }, '/premises-area'),
        row('How much you need', labels(AMOUNTS, answers.amounts), '/amount'),
        row('When you need it', { text: label(TIMEFRAMES, answers.timeframe ?? '') }, '/timeframe'),
        row('Can cover part of the costs', yesNo(answers.matchFunding), '/match-funding'),
        answers.equity && row('Open to investors', yesNo(answers.equity), '/equity')
      ].filter(Boolean)
    })
  })

  return router
}
