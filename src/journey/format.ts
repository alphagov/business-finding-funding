const STATUSES: Record<string, string> = {
  active: 'Active',
  dissolved: 'Dissolved',
  liquidation: 'In liquidation',
  receivership: 'In receivership',
  administration: 'In administration',
  'voluntary-arrangement': 'Voluntary arrangement',
  'converted-closed': 'Converted or closed',
  'insolvency-proceedings': 'Insolvency proceedings',
  registered: 'Registered',
  removed: 'Removed',
  closed: 'Closed',
  open: 'Open'
}

export function companyStatus (status: string): string {
  return STATUSES[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ')
}

// For example "23 July 2001".
export function formatDate (isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  })
}

function plural (count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// How long since the company was incorporated, for example "25 years, 3 months".
export function tradingHistory (incorporatedOn: string, today = new Date()): string {
  const start = new Date(`${incorporatedOn}T00:00:00Z`)
  let months = (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + today.getUTCMonth() - start.getUTCMonth()
  if (today.getUTCDate() < start.getUTCDate()) months -= 1
  if (months < 1) return 'Less than 1 month'

  const years = Math.floor(months / 12)
  const parts = []
  if (years > 0) parts.push(plural(years, 'year'))
  if (months % 12 > 0) parts.push(plural(months % 12, 'month'))
  return parts.join(', ')
}

export function escapeHtml (value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

// Joins lines, such as an address, with line breaks for a summary list.
export function linesHtml (lines: string[]): string {
  return lines.map(escapeHtml).join('<br>')
}
