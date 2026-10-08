import type { Option } from './questions'

// The sectors used in the pilot prototype. Some overlap, for example "Health
// and Social Care" and "Human Health and Social Work Activities". The list
// should be reviewed when the funding data is agreed.
export const SECTORS: Option[] = [
  { value: 'administrative-support', text: 'Administrative and Support Service Activities' },
  { value: 'advisory-financial', text: 'Advisory and Financial Services' },
  { value: 'agriculture', text: 'Agriculture, Forestry and Fishing' },
  { value: 'arts-leisure', text: 'Arts, Entertainment and Leisure' },
  { value: 'franchises', text: 'Business Franchises' },
  { value: 'construction', text: 'Construction' },
  { value: 'consumer-goods', text: 'Consumer Goods and Services' },
  { value: 'education', text: 'Education' },
  { value: 'energy-supply', text: 'Electricity, Gas, Steam and Air Conditioning Supply' },
  { value: 'engineering', text: 'Engineering' },
  { value: 'extractives', text: 'Extractives and Mining' },
  { value: 'financial-insurance', text: 'Financial and Insurance Services' },
  { value: 'haulage-logistics', text: 'Haulage and Logistics' },
  { value: 'health-social-care', text: 'Health and Social Care' },
  { value: 'hospitality', text: 'Hospitality, Accommodation and Food Service Activities' },
  { value: 'human-health', text: 'Human Health and Social Work Activities' },
  { value: 'life-sciences', text: 'Life Sciences' },
  { value: 'manufacturing', text: 'Manufacturing' },
  { value: 'mining-quarrying', text: 'Mining and Quarrying' },
  { value: 'online-retail', text: 'Online retail' },
  { value: 'plastics', text: 'Plastics Manufacturing' },
  { value: 'professional-scientific', text: 'Professional, Scientific and Technical Activities' },
  { value: 'real-estate', text: 'Real Estate Activities' },
  { value: 'specialist-engineering', text: 'Specialist Engineering, Infrastructure' },
  { value: 'technology', text: 'Technology' },
  { value: 'transport-storage', text: 'Transportation and Storage' },
  { value: 'utilities', text: 'Utilities' },
  { value: 'waste', text: 'Waste Management' },
  { value: 'wholesale-retail', text: 'Wholesale and Retail Trade' },
  { value: 'other', text: 'Other' }
]

// The first 2 digits of a SIC 2007 code give its division. Divisions are
// grouped into sections, which map to the sectors above. Sections with no
// close match, such as public administration, are left out.
const SECTIONS: Array<[number, number, string]> = [
  [1, 3, 'agriculture'],
  [5, 9, 'mining-quarrying'],
  [10, 33, 'manufacturing'],
  [35, 35, 'energy-supply'],
  [36, 39, 'waste'],
  [41, 43, 'construction'],
  [45, 47, 'wholesale-retail'],
  [49, 53, 'transport-storage'],
  [55, 56, 'hospitality'],
  [58, 63, 'technology'],
  [64, 66, 'financial-insurance'],
  [68, 68, 'real-estate'],
  [69, 75, 'professional-scientific'],
  [77, 82, 'administrative-support'],
  [85, 85, 'education'],
  [86, 88, 'human-health'],
  [90, 93, 'arts-leisure']
]

// Suggests sectors from a company's SIC codes, at most 3, in the order of
// the codes.
export function sectorsForSicCodes (sicCodes: string[]): string[] {
  const sectors = new Set<string>()

  for (const code of sicCodes) {
    const division = Number(code.slice(0, 2))
    const section = SECTIONS.find(([first, last]) => division >= first && division <= last)
    if (section) sectors.add(section[2])
  }

  return [...sectors].slice(0, 3)
}
