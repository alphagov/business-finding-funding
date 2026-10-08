import { normalisePostcode } from '../postcodes'
import type { Answers } from './answers'

// The order of the journey, and when each question applies. The next page is
// always the first question that applies and has not been answered, so the
// change links on the check answers page come back to it without any extra
// routing.

export const CHECK_ANSWERS = '/check-answers'

interface Step {
  path: string
  // Answers that belong to this step, removed if the step stops applying.
  answers: Array<keyof Answers>
  applies?: (answers: Answers) => boolean
  isAnswered: (answers: Answers) => boolean
}

export function hasUkPostcode (answers: Answers): boolean {
  return Boolean(answers.company?.postcode && normalisePostcode(answers.company.postcode))
}

function wantsPremises (answers: Answers): boolean {
  return answers.purposes?.includes('premises') ?? false
}

function premisesElsewhere (answers: Answers): boolean {
  return wantsPremises(answers) && answers.premisesInArea === 'no'
}

const STEPS: Step[] = [
  { path: '/business-name', answers: ['companySearch'], isAnswered: (a) => Boolean(a.companySearch) },
  { path: '/select-business', answers: ['company'], isAnswered: (a) => Boolean(a.company) },
  { path: '/confirm-business', answers: ['companyConfirmed'], isAnswered: (a) => a.companyConfirmed === true },
  {
    path: '/registered-address',
    answers: ['useRegisteredAddress'],
    applies: hasUkPostcode,
    isAnswered: (a) => a.useRegisteredAddress !== undefined
  },
  {
    // The area can also come from the registered address, so it is not
    // removed when this step does not apply.
    path: '/postcode',
    answers: [],
    applies: (a) => !hasUkPostcode(a) || a.useRegisteredAddress === false,
    isAnswered: (a) => Boolean(a.area)
  },
  { path: '/confirm-area', answers: ['areaConfirmed'], isAnswered: (a) => a.areaConfirmed === true },
  { path: '/sector', answers: ['sectors'], isAnswered: (a) => Boolean(a.sectors?.length) },
  { path: '/purpose', answers: ['purposes'], isAnswered: (a) => Boolean(a.purposes?.length) },
  {
    path: '/premises-area',
    answers: ['premisesInArea'],
    applies: wantsPremises,
    isAnswered: (a) => a.premisesInArea !== undefined
  },
  {
    path: '/premises-postcode',
    answers: ['premisesArea'],
    applies: premisesElsewhere,
    isAnswered: (a) => Boolean(a.premisesArea)
  },
  {
    path: '/confirm-premises-area',
    answers: ['premisesAreaConfirmed'],
    applies: premisesElsewhere,
    isAnswered: (a) => a.premisesAreaConfirmed === true
  },
  { path: '/amount', answers: ['amounts'], isAnswered: (a) => Boolean(a.amounts?.length) },
  { path: '/timeframe', answers: ['timeframe'], isAnswered: (a) => Boolean(a.timeframe) },
  { path: '/match-funding', answers: ['matchFunding'], isAnswered: (a) => Boolean(a.matchFunding) },
  {
    // Equity is offered to businesses that may not be able to pay towards
    // the costs themselves.
    path: '/equity',
    answers: ['equity'],
    applies: (a) => a.matchFunding === 'no' || a.matchFunding === 'not-sure',
    isAnswered: (a) => Boolean(a.equity)
  }
]

export const JOURNEY_PATHS = [...STEPS.map((step) => step.path), CHECK_ANSWERS]

function applies (step: Step, answers: Answers): boolean {
  return step.applies?.(answers) ?? true
}

// Removes answers to questions that no longer apply, for example the
// premises questions after "Move or expand premises" is unticked.
export function tidy (answers: Answers): Answers {
  const result = { ...answers }

  for (const step of STEPS) {
    if (!applies(step, result)) {
      for (const key of step.answers) delete result[key]
    }
  }
  return result
}

export function nextPath (answers: Answers): string {
  return STEPS.find((step) => applies(step, answers) && !step.isAnswered(answers))?.path ?? CHECK_ANSWERS
}

// A page can be visited once every earlier question that applies has been
// answered, as long as it applies itself.
export function canVisit (path: string, answers: Answers): boolean {
  if (path === CHECK_ANSWERS) return nextPath(answers) === CHECK_ANSWERS

  const index = STEPS.findIndex((step) => step.path === path)
  return index >= 0 &&
    applies(STEPS[index], answers) &&
    STEPS.slice(0, index).every((step) => !applies(step, answers) || step.isAnswered(answers))
}

export function previousPath (path: string, answers: Answers): string {
  const index = path === CHECK_ANSWERS ? STEPS.length : STEPS.findIndex((step) => step.path === path)

  for (let i = index - 1; i >= 0; i--) {
    if (applies(STEPS[i], answers)) return STEPS[i].path
  }
  return '/'
}
