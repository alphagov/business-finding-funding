import { escapeHtml } from './format'
import type { Answers } from './answers'
import { SECTORS, sectorsForSicCodes } from './sectors'

export interface Option {
  value: string
  text: string
  // Shown after an "or" divider, and cannot be chosen with other options.
  exclusive?: boolean
}

type ChoiceAnswer = 'sectors' | 'purposes' | 'premisesInArea' | 'amounts' | 'timeframe' | 'matchFunding' | 'equity'

// A question answered by choosing one option (radios) or several
// (checkboxes). These all share one template and one route handler.
export interface ChoiceQuestion {
  path: string
  answer: ChoiceAnswer
  multiple: boolean
  title: (answers: Answers) => string
  hintHtml?: (answers: Answers) => string | undefined
  options: Option[]
  errors: {
    required: (answers: Answers) => string
    tooMany?: string
    exclusive?: string
  }
  max?: number
  // Options to tick before the visitor has answered.
  suggested?: (answers: Answers) => string[]
}

export const PURPOSES: Option[] = [
  { value: 'digital-ai', text: 'Adopt digital technology or AI' },
  { value: 'research-innovation', text: 'Carry out research and innovation' },
  { value: 'new-product', text: 'Develop a new product or service' },
  { value: 'export', text: 'Enter new markets or export overseas' },
  { value: 'grow-sales', text: 'Grow sales' },
  { value: 'hire-staff', text: 'Hire staff' },
  { value: 'cash-flow', text: 'Improve cash flow' },
  { value: 'productivity', text: 'Improve productivity' },
  { value: 'equipment', text: 'Invest in equipment' },
  { value: 'premises', text: 'Move or expand premises' },
  { value: 'energy', text: 'Reduce energy costs or become more sustainable' },
  { value: 'start-business', text: 'Start a business' },
  { value: 'train-staff', text: 'Train staff and develop skills' }
]

export const AMOUNTS: Option[] = [
  { value: 'up-to-10k', text: 'Up to £10,000' },
  { value: '10k-to-25k', text: '£10,001 to £25,000' },
  { value: '25k-to-50k', text: '£25,001 to £50,000' },
  { value: '50k-to-150k', text: '£50,001 to £150,000' },
  { value: '150k-to-250k', text: '£150,001 to £250,000' },
  { value: 'over-250k', text: 'More than £250,000' },
  { value: 'not-sure', text: 'I do not know how much I need', exclusive: true }
]

export const TIMEFRAMES: Option[] = [
  { value: 'less-than-1-month', text: 'In less than 1 month' },
  { value: '1-to-3-months', text: 'In 1 to 3 months' },
  { value: '4-to-6-months', text: 'In 4 to 6 months' },
  { value: 'over-6-months', text: 'More than 6 months' },
  { value: 'no-fixed-date', text: 'I do not have a fixed date', exclusive: true }
]

export const YES_NO_NOT_SURE: Option[] = [
  { value: 'yes', text: 'Yes' },
  { value: 'no', text: 'No' },
  { value: 'not-sure', text: 'I’m not sure' }
]

function areaName (answers: Answers): string {
  return answers.area?.localAuthority ?? 'your funding area'
}

export const QUESTIONS: ChoiceQuestion[] = [
  {
    path: '/sector',
    answer: 'sectors',
    multiple: true,
    title: () => 'What sector is your business in?',
    hintHtml: (answers) => {
      const suggested = suggestedSectors(answers)
      const names = suggested.map((value) => `<strong>${escapeHtml(label(SECTORS, value))}</strong>`)
      return 'Select up to 3.' + (names.length && !answers.sectors
        ? ` We have selected ${names.join(' and ')} based on your Companies House record. Change this if it is not right.`
        : '')
    },
    options: SECTORS,
    max: 3,
    errors: {
      required: () => 'Select the sector your business is in',
      tooMany: 'Select 3 sectors or fewer'
    },
    suggested: suggestedSectors
  },
  {
    path: '/purpose',
    answer: 'purposes',
    multiple: true,
    title: () => 'What best describes what you’re trying to achieve?',
    hintHtml: () => 'Select all that apply.',
    options: PURPOSES,
    errors: { required: () => 'Select what you’re trying to achieve' }
  },
  {
    path: '/premises-area',
    answer: 'premisesInArea',
    multiple: false,
    title: (answers) => `Is the property you want to buy or rent in ${areaName(answers)}?`,
    options: [
      { value: 'yes', text: 'Yes' },
      { value: 'no', text: 'No, it’s somewhere else' }
    ],
    errors: { required: (answers) => `Select yes if the property is in ${areaName(answers)}` }
  },
  {
    path: '/amount',
    answer: 'amounts',
    multiple: true,
    title: () => 'How much money do you need?',
    hintHtml: () => 'Select all that apply.',
    options: AMOUNTS,
    errors: {
      required: () => 'Select how much money you need, or select ‘I do not know how much I need’',
      exclusive: 'Select how much money you need, or select ‘I do not know how much I need’'
    }
  },
  {
    path: '/timeframe',
    answer: 'timeframe',
    multiple: false,
    title: () => 'When do you need the funding?',
    hintHtml: () => 'We use this to match options to how quickly you need finance in your business.',
    options: TIMEFRAMES,
    errors: { required: () => 'Select when you need the funding' }
  },
  {
    path: '/match-funding',
    answer: 'matchFunding',
    multiple: false,
    title: () => 'Could your business cover part of the costs itself?',
    hintHtml: () => 'Some grants only pay for part of what you need, so you might need to prove upfront that you can cover the rest. This is often called match funding.',
    options: YES_NO_NOT_SURE,
    errors: { required: () => 'Select yes if your business could cover part of the costs itself' }
  },
  {
    path: '/equity',
    answer: 'equity',
    multiple: false,
    title: () => 'Are you open to giving investors a stake in your business?',
    hintHtml: () => 'Equity finance means investors put money into your business in return for a share of it. You do not make monthly repayments, but investors may have a say in decisions and share in future profits or a sale.',
    options: YES_NO_NOT_SURE,
    errors: { required: () => 'Select yes if you are open to giving investors a stake in your business' }
  }
]

function suggestedSectors (answers: Answers): string[] {
  return sectorsForSicCodes(answers.company?.sicCodes ?? [])
}

export function label (options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.text ?? value
}

// Checks the submitted values and returns an error message if they are not
// a valid answer.
export function validate (question: ChoiceQuestion, values: string[], answers: Answers): string | undefined {
  const known = values.filter((value) => question.options.some((option) => option.value === value))
  const exclusive = question.options.filter((option) => option.exclusive).map((option) => option.value)

  if (known.length === 0 || known.length !== values.length) return question.errors.required(answers)
  if (!question.multiple && known.length > 1) return question.errors.required(answers)
  if (known.length > 1 && known.some((value) => exclusive.includes(value))) return question.errors.exclusive ?? question.errors.required(answers)
  if (question.max && known.length > question.max) return question.errors.tooMany
  return undefined
}
