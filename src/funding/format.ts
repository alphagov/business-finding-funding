import { escapeHtml, formatDate } from '../journey/format'
import type { FundingType, Scheme } from './schemes'

export const HEADINGS: Record<FundingType, { heading: string, intro: string, plural: string }> = {
  loan: {
    heading: 'Loans',
    plural: 'loans',
    intro: 'Loans allow you to borrow a lump sum and pay this back over time. A fixed repayment schedule means you know how much you’ll be paying each month, but you will also have to pay interest and charges.'
  },
  grant: {
    heading: 'Grants',
    plural: 'grants',
    intro: 'A grant is an award of money given to a business for a specific purpose. You do not have to pay a grant back, but there may be a long application process.'
  },
  equity: {
    heading: 'Equity finance',
    plural: 'equity finance options',
    intro: 'Equity finance is when people invest money in your company in exchange for a share in ownership. You do not have to repay the money that investors give you, but equity finance usually involves giving investors a say in decision-making.'
  }
}

const AMOUNT_LABELS: Record<FundingType, string> = {
  loan: 'Loan amount',
  grant: 'Grant amount',
  equity: 'Investment amount'
}

function pounds (value: number): string {
  return `£${value.toLocaleString('en-GB')}`
}

export function formatAmount (amount: Scheme['amount']): string | undefined {
  const { min, max } = amount ?? {}

  if (min && max) return `${pounds(min)} to ${pounds(max)}`
  if (max) return `Up to ${pounds(max)}`
  if (min) return `From ${pounds(min)}`
  return undefined
}

interface Row {
  key: { text: string }
  value: { text: string } | { html: string }
}

// The details shown on a scheme's card. The same labels are used wherever
// a scheme is shown.
export function schemeRows (scheme: Scheme): Row[] {
  const rows: Array<[string, string | undefined]> = [[AMOUNT_LABELS[scheme.type], formatAmount(scheme.amount)]]

  if (scheme.type === 'loan') {
    rows.push(['Interest rate', scheme.interestRate], ['How long to repay', scheme.repaymentTerm], ['Fees', scheme.fees])
  }
  if (scheme.type === 'grant') {
    rows.push(
      ['How much it pays', scheme.contribution],
      ['Match funding', scheme.matchFundingRequired === undefined
        ? undefined
        : scheme.matchFundingRequired ? 'You need to pay part of the costs' : 'Not needed'],
      ['Apply by', scheme.closesOn && formatDate(scheme.closesOn)],
      ['Typical decision time', scheme.decisionTime]
    )
  }
  if (scheme.type === 'equity') {
    rows.push(['Investment type', scheme.investmentType])
  }

  return [
    ...rows
      .filter((row): row is [string, string] => Boolean(row[1]))
      .map(([key, value]) => ({ key: { text: key }, value: { text: value } })),
    {
      key: { text: 'Eligibility' },
      value: { html: `<ul class="govuk-list govuk-list--bullet">${scheme.eligibility.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` }
    }
  ]
}

export interface Card {
  scheme: Scheme
  rows: Row[]
  checkedOn: string
  tag?: { text: string, classes: string }
  shortlisted: boolean
}

export function card (scheme: Scheme, shortlist: string[], tag?: 'most-relevant' | 'possible-fit'): Card {
  return {
    scheme,
    rows: schemeRows(scheme),
    checkedOn: formatDate(scheme.checkedOn),
    tag: tag && (tag === 'most-relevant'
      ? { text: 'Most relevant', classes: 'govuk-tag--green' }
      : { text: 'Possible fit', classes: 'govuk-tag--grey' }),
    shortlisted: shortlist.includes(scheme.id)
  }
}
