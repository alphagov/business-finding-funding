import { loadConfig } from '../config'
import { loadFunding } from '../funding/schemes'
import { createApiApp } from './app'

// Uses port 3001 locally when PORT is not set, so it can run alongside
// Find funding on port 3000.
const config = loadConfig({ PORT: '3001', ...process.env })

createApiApp(config, loadFunding()).listen(config.port, () => {
  console.log(`Funding data API listening on port ${config.port}`)
})
