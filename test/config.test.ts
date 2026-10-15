import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from '../src/config'

test('config uses defaults when nothing is set', () => {
  assert.deepEqual(loadConfig({}), {
    port: 3000,
    production: false,
    sitePassword: undefined,
    sessionSecret: undefined,
    companiesHouseApiKey: undefined,
    notifyApiKey: undefined,
    notifyResultsTemplateId: undefined,
    serviceUrl: undefined,
    fundingApiUrl: undefined
  })
})

test('config reads settings from the environment', () => {
  assert.deepEqual(
    loadConfig({
      PORT: '8080',
      NODE_ENV: 'production',
      SITE_PASSWORD: 'secret',
      SESSION_SECRET: 'session',
      COMPANIES_HOUSE_API_KEY: 'key',
      NOTIFY_API_KEY: 'notify-key',
      NOTIFY_RESULTS_TEMPLATE_ID: 'template',
      SERVICE_URL: 'https://www.example.gov.uk/',
      FUNDING_API_URL: 'https://funding-api.example.gov.uk/'
    }),
    {
      port: 8080,
      production: true,
      sitePassword: 'secret',
      sessionSecret: 'session',
      companiesHouseApiKey: 'key',
      notifyApiKey: 'notify-key',
      notifyResultsTemplateId: 'template',
      serviceUrl: 'https://www.example.gov.uk',
      fundingApiUrl: 'https://funding-api.example.gov.uk'
    }
  )
})

test('empty settings count as not set', () => {
  const config = loadConfig({ SITE_PASSWORD: '', SESSION_SECRET: '', COMPANIES_HOUSE_API_KEY: '', NOTIFY_API_KEY: '', SERVICE_URL: '', FUNDING_API_URL: '' })

  assert.equal(config.sitePassword, undefined)
  assert.equal(config.sessionSecret, undefined)
  assert.equal(config.companiesHouseApiKey, undefined)
  assert.equal(config.notifyApiKey, undefined)
  assert.equal(config.serviceUrl, undefined)
  assert.equal(config.fundingApiUrl, undefined)
})
