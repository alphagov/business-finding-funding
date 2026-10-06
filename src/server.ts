import { createApp } from './app'
import { loadConfig } from './config'

const config = loadConfig()

createApp(config).listen(config.port, () => {
  console.log(`Listening on port ${config.port}`)
})
