// Sends emails using GOV.UK Notify:
// https://docs.notifications.service.gov.uk/rest-api.html
import crypto from 'node:crypto'

export interface Email {
  templateId: string
  emailAddress: string
  personalisation: Record<string, string>
}

export interface Notify {
  sendEmail: (email: Email) => Promise<void>
}

const TIMEOUT_MS = 5000

// Notify turned the email down, for example because the service is in trial
// mode and the address is not in the team.
export class NotifyError extends Error {
  constructor (readonly status: number, readonly errors: Array<{ error?: string, message?: string }>) {
    super(`GOV.UK Notify returned ${status}: ${errors.map((e) => `${e.error}: ${e.message}`).join('; ')}`)
  }

  // Trial mode only allows emails to the Notify team and its guest list.
  get trialMode (): boolean {
    return this.errors.some((e) => /team-only API key|trial mode/i.test(e.message ?? ''))
  }
}

function base64url (value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export class NotifyApi implements Notify {
  private readonly serviceId: string
  private readonly secret: string

  constructor (
    apiKey: string,
    private readonly baseUrl = 'https://api.notifications.service.gov.uk',
    private readonly fetchFn: typeof fetch = fetch
  ) {
    // Keys look like {key name}-{service ID}-{secret}, and both IDs are
    // 36 character UUIDs.
    if (apiKey.length < 74) throw new Error('NOTIFY_API_KEY is not a GOV.UK Notify API key')
    this.serviceId = apiKey.slice(-73, -37)
    this.secret = apiKey.slice(-36)
  }

  // Notify takes a JSON Web Token signed with the key's secret, made fresh
  // for each request because Notify only accepts tokens up to 30 seconds old.
  token (now = Date.now()): string {
    const unsigned = `${base64url({ typ: 'JWT', alg: 'HS256' })}.${base64url({ iss: this.serviceId, iat: Math.floor(now / 1000) })}`
    return `${unsigned}.${crypto.createHmac('sha256', this.secret).update(unsigned).digest('base64url')}`
  }

  async sendEmail ({ templateId, emailAddress, personalisation }: Email): Promise<void> {
    if (!templateId) throw new Error('There is no GOV.UK Notify template ID. Set NOTIFY_RESULTS_TEMPLATE_ID')

    const res = await this.fetchFn(`${this.baseUrl}/v2/notifications/email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, email_address: emailAddress, personalisation }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (res.ok) return
    const body = await res.json().catch(() => ({})) as { errors?: Array<{ error?: string, message?: string }> }
    throw new NotifyError(res.status, body.errors ?? [])
  }
}

// Used when running locally and in tests without an API key. Keeps the
// emails instead of sending them, and can print the link so it can be tried.
export class FakeNotify implements Notify {
  readonly sent: Email[] = []

  constructor (private readonly log = false) {}

  async sendEmail (email: Email): Promise<void> {
    this.sent.push(email)
    if (this.log) console.log(`NOTIFY_API_KEY is not set, so no email was sent. The link was: ${email.personalisation.link}`)
  }
}

// Used in production when NOTIFY_API_KEY is not set, so the reason is clear
// in the logs.
export const missingNotify: Notify = {
  sendEmail: async () => { throw new Error('NOTIFY_API_KEY is not set') }
}
