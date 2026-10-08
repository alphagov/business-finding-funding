import type { Answers } from '../journey/answers'
import type { Area } from '../postcodes'
import type { FundingType, Scheme } from './schemes'

// Which schemes to show a business, and how to group them.
//
// These rules are a starting point to be agreed with policy. They are kept
// here, away from the pages, so they can be changed and tested on their own.
//
// A scheme is shown if:
// - it has not closed
// - it covers the funding area, or the area of the property if the business
//   is moving or expanding premises somewhere else
// - for equity, the business is open to, or not sure about, giving
//   investors a stake
//
// A scheme shown is "most relevant" if all of these are true, and a
// "possible fit" otherwise:
// - its amounts overlap with how much the business needs
// - it is for one of the business's sectors, or for any sector
// - it is for one of the things the business wants to achieve, or for anything
// - it does not need match funding from a business that cannot provide it

export interface Match {
  scheme: Scheme
  mostRelevant: boolean
}

export interface Results {
  type: FundingType
  mostRelevant: Scheme[]
  possibleFit: Scheme[]
}

const AMOUNT_BANDS: Record<string, [number, number]> = {
  'up-to-10k': [0, 10_000],
  '10k-to-25k': [10_001, 25_000],
  '25k-to-50k': [25_001, 50_000],
  '50k-to-150k': [50_001, 150_000],
  '150k-to-250k': [150_001, 250_000],
  'over-250k': [250_001, Infinity]
}

export function coversArea (scheme: Scheme, area: Area): boolean {
  const { areas } = scheme
  if (!areas) return true

  return Boolean(
    areas.countries?.includes(area.country) ||
    (area.region && areas.regions?.includes(area.region)) ||
    areas.localAuthorities?.includes(area.localAuthorityCode)
  )
}

function overlaps (scheme: Scheme, amounts: string[] = []): boolean {
  if (amounts.length === 0 || amounts.includes('not-sure')) return true

  const min = scheme.amount?.min ?? 0
  const max = scheme.amount?.max ?? Infinity
  return amounts.some((value) => {
    const band = AMOUNT_BANDS[value]
    return band !== undefined && band[0] <= max && band[1] >= min
  })
}

function sharesAny (allowed: string[] | undefined, chosen: string[] = []): boolean {
  return !allowed?.length || allowed.some((value) => chosen.includes(value))
}

// Local schemes come before regional, national and UK-wide ones.
function reach (scheme: Scheme): number {
  if (scheme.areas?.localAuthorities?.length) return 0
  if (scheme.areas?.regions?.length) return 1
  if (scheme.areas?.countries?.length) return 2
  return 3
}

export function matchScheme (scheme: Scheme, answers: Answers, today: string): Match | undefined {
  if (scheme.closesOn && scheme.closesOn < today) return undefined

  const areas = [answers.area, answers.premisesArea].filter((area): area is Area => Boolean(area))
  if (!areas.some((area) => coversArea(scheme, area))) return undefined

  if (scheme.type === 'equity' && answers.equity !== 'yes' && answers.equity !== 'not-sure') return undefined

  const mostRelevant = overlaps(scheme, answers.amounts) &&
    sharesAny(scheme.sectors, answers.sectors) &&
    sharesAny(scheme.purposes, answers.purposes) &&
    !(scheme.matchFundingRequired && answers.matchFunding === 'no')

  return { scheme, mostRelevant }
}

export function findFunding (schemes: Scheme[], answers: Answers, today = new Date().toISOString().slice(0, 10)): Results[] {
  const matches = schemes
    .map((scheme) => matchScheme(scheme, answers, today))
    .filter((match): match is Match => Boolean(match))
    .sort((a, b) => reach(a.scheme) - reach(b.scheme) || a.scheme.name.localeCompare(b.scheme.name))

  return (['loan', 'grant', 'equity'] as const)
    .map((type) => ({
      type,
      mostRelevant: matches.filter((m) => m.scheme.type === type && m.mostRelevant).map((m) => m.scheme),
      possibleFit: matches.filter((m) => m.scheme.type === type && !m.mostRelevant).map((m) => m.scheme)
    }))
    .filter((result) => result.mostRelevant.length + result.possibleFit.length > 0)
}
