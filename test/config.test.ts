import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from '../src/config'

test('config uses defaults when nothing is set', () => {
  assert.deepEqual(loadConfig({}), { port: 3000, production: false, sitePassword: undefined })
})

test('config reads settings from the environment', () => {
  assert.deepEqual(
    loadConfig({ PORT: '8080', NODE_ENV: 'production', SITE_PASSWORD: 'secret' }),
    { port: 8080, production: true, sitePassword: 'secret' }
  )
})

test('an empty SITE_PASSWORD counts as not set', () => {
  assert.equal(loadConfig({ SITE_PASSWORD: '' }).sitePassword, undefined)
})
