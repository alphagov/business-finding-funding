import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from '../src/config'

test('config uses defaults when nothing is set', () => {
  assert.deepEqual(loadConfig({}), {
    port: 3000,
    production: false,
    sitePassword: undefined,
    sessionSecret: undefined,
    companiesHouseApiKey: undefined
  })
})

test('config reads settings from the environment', () => {
  assert.deepEqual(
    loadConfig({ PORT: '8080', NODE_ENV: 'production', SITE_PASSWORD: 'secret', SESSION_SECRET: 'session', COMPANIES_HOUSE_API_KEY: 'key' }),
    { port: 8080, production: true, sitePassword: 'secret', sessionSecret: 'session', companiesHouseApiKey: 'key' }
  )
})

test('empty settings count as not set', () => {
  const config = loadConfig({ SITE_PASSWORD: '', SESSION_SECRET: '', COMPANIES_HOUSE_API_KEY: '' })

  assert.equal(config.sitePassword, undefined)
  assert.equal(config.sessionSecret, undefined)
  assert.equal(config.companiesHouseApiKey, undefined)
})
