import type { Company } from '../companies-house'
import type { Area } from '../postcodes'

// Everything the visitor has told us so far. It is kept in a signed cookie,
// so keep it small: store option values, not their labels.
export interface Answers {
  companySearch?: string
  company?: Company
  companyConfirmed?: boolean
  useRegisteredAddress?: boolean
  area?: Area
  areaConfirmed?: boolean
  sectors?: string[]
  purposes?: string[]
  premisesInArea?: string
  premisesArea?: Area
  premisesAreaConfirmed?: boolean
  amounts?: string[]
  timeframe?: string
  matchFunding?: string
  equity?: string
  // Ids of the funding schemes the visitor has shortlisted.
  shortlist?: string[]
}
