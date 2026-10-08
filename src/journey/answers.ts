import type { Company } from '../companies-house'
import type { Area } from '../postcodes'

// Everything the visitor has told us so far. It is kept in a signed cookie,
// so keep it small.
export interface Answers {
  companySearch?: string
  company?: Company
  useRegisteredAddress?: boolean
  area?: Area
}
