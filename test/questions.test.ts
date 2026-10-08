import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Company } from '../src/companies-house'
import type { Answers } from '../src/journey/answers'
import { QUESTIONS, validate } from '../src/journey/questions'
import { sectorsForSicCodes } from '../src/journey/sectors'
import { canVisit, nextPath, previousPath, tidy } from '../src/journey/steps'
import type { Area } from '../src/postcodes'

const MANCHESTER: Area = { postcode: 'M60 2LA', localAuthority: 'Manchester', localAuthorityCode: 'E08000003', country: 'England' }
const LEEDS: Area = { postcode: 'LS1 1UR', localAuthority: 'Leeds', localAuthorityCode: 'E08000035', country: 'England' }

const COMPANY: Company = {
  number: '00000001',
  name: 'EXAMPLE BAKERY LIMITED',
  status: 'active',
  addressLines: ['1 Example Street', 'Manchester', 'M60 2LA'],
  postcode: 'M60 2LA',
  sicCodes: ['10710']
}

const UP_TO_AREA: Answers = {
  companySearch: 'example',
  company: COMPANY,
  companyConfirmed: true,
  useRegisteredAddress: true,
  area: MANCHESTER,
  areaConfirmed: true
}

const COMPLETE: Answers = {
  ...UP_TO_AREA,
  sectors: ['manufacturing'],
  purposes: ['equipment'],
  amounts: ['up-to-10k'],
  timeframe: '1-to-3-months',
  matchFunding: 'yes'
}

function question (path: string): typeof QUESTIONS[number] {
  return QUESTIONS.find((q) => q.path === path)!
}

test('SIC codes suggest at most 3 sectors, without repeats', () => {
  assert.deepEqual(sectorsForSicCodes(['10710']), ['manufacturing'])
  assert.deepEqual(sectorsForSicCodes(['10710', '28290', '47110']), ['manufacturing', 'wholesale-retail'])
  assert.deepEqual(sectorsForSicCodes(['01110', '41100', '62012', '85200']), ['agriculture', 'construction', 'technology'])
  assert.deepEqual(sectorsForSicCodes(['84110', '99999']), [])
})

test('the next page is the first question that applies and has not been answered', () => {
  assert.equal(nextPath({}), '/business-name')
  assert.equal(nextPath({ companySearch: 'example', company: COMPANY }), '/confirm-business')
  assert.equal(nextPath(UP_TO_AREA), '/sector')
  assert.equal(nextPath(COMPLETE), '/check-answers')
  assert.equal(nextPath({ ...COMPLETE, purposes: ['premises'] }), '/premises-area')
  assert.equal(nextPath({ ...COMPLETE, purposes: ['premises'], premisesInArea: 'no' }), '/premises-postcode')
  assert.equal(nextPath({ ...COMPLETE, matchFunding: 'not-sure' }), '/equity')
})

test('the registered address question is skipped for companies without a UK postcode', () => {
  const overseas = { companySearch: 'x', company: { ...COMPANY, postcode: undefined }, companyConfirmed: true }

  assert.equal(nextPath(overseas), '/postcode')
  assert.ok(!canVisit('/registered-address', overseas))
  assert.equal(previousPath('/postcode', overseas), '/confirm-business')
})

test('pages can only be visited once the earlier questions are answered', () => {
  assert.ok(canVisit('/business-name', {}))
  assert.ok(!canVisit('/sector', {}))
  assert.ok(canVisit('/sector', UP_TO_AREA))
  assert.ok(canVisit('/business-name', COMPLETE))
  assert.ok(!canVisit('/equity', COMPLETE))
  assert.ok(canVisit('/check-answers', COMPLETE))
  assert.ok(!canVisit('/check-answers', UP_TO_AREA))
  assert.ok(!canVisit('/not-a-page', COMPLETE))
})

test('back links skip questions that do not apply', () => {
  assert.equal(previousPath('/business-name', {}), '/')
  assert.equal(previousPath('/sector', UP_TO_AREA), '/confirm-area')
  assert.equal(previousPath('/confirm-area', { ...UP_TO_AREA, useRegisteredAddress: false }), '/postcode')
  assert.equal(previousPath('/confirm-area', UP_TO_AREA), '/registered-address')
  assert.equal(previousPath('/amount', COMPLETE), '/purpose')
  assert.equal(previousPath('/amount', { ...COMPLETE, purposes: ['premises'], premisesInArea: 'no' }), '/confirm-premises-area')
  assert.equal(previousPath('/check-answers', COMPLETE), '/match-funding')
  assert.equal(previousPath('/check-answers', { ...COMPLETE, matchFunding: 'no', equity: 'yes' }), '/equity')
})

test('answers to questions that no longer apply are removed', () => {
  const tidied = tidy({ ...COMPLETE, premisesInArea: 'no', premisesArea: LEEDS, premisesAreaConfirmed: true, equity: 'yes' })

  assert.equal(tidied.premisesInArea, undefined)
  assert.equal(tidied.premisesArea, undefined)
  assert.equal(tidied.premisesAreaConfirmed, undefined)
  assert.equal(tidied.equity, undefined)
  assert.deepEqual(tidied.area, MANCHESTER)

  const kept = { ...COMPLETE, purposes: ['premises'], premisesInArea: 'no', premisesArea: LEEDS }
  assert.deepEqual(tidy(kept), kept)
})

test('choice answers are checked', () => {
  const sector = question('/sector')
  const amount = question('/amount')
  const timeframe = question('/timeframe')

  assert.equal(validate(sector, ['manufacturing'], COMPLETE), undefined)
  assert.equal(validate(sector, [], COMPLETE), 'Select the sector your business is in')
  assert.equal(validate(sector, ['manufacturing', 'made-up'], COMPLETE), 'Select the sector your business is in')
  assert.equal(validate(sector, ['manufacturing', 'construction', 'technology', 'education'], COMPLETE), 'Select 3 sectors or fewer')

  assert.equal(validate(amount, ['up-to-10k', '10k-to-25k'], COMPLETE), undefined)
  assert.equal(validate(amount, ['not-sure'], COMPLETE), undefined)
  assert.match(validate(amount, ['up-to-10k', 'not-sure'], COMPLETE) ?? '', /or select ‘I do not know how much I need’/)

  assert.equal(validate(timeframe, ['1-to-3-months'], COMPLETE), undefined)
  assert.equal(validate(timeframe, ['1-to-3-months', '4-to-6-months'], COMPLETE), 'Select when you need the funding')
})

test('the premises question names the funding area', () => {
  const premises = question('/premises-area')

  assert.equal(premises.title(UP_TO_AREA), 'Is the property you want to buy or rent in Manchester?')
  assert.equal(validate(premises, [], UP_TO_AREA), 'Select yes if the property is in Manchester')
})
