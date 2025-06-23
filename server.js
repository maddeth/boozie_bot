import bodyParser from 'body-parser'
import express from 'express'
import findRemoveSync from 'find-remove'
import swaggerUi from 'swagger-ui-express'
import swaggerFile from './swagger-output.json' with { type: "json" }

import logger from './logger.js'
import config from './config.json' with { type: "json" }
import { requestLogger } from './middleware/requestLogger.js'

// Services
import WebSocketService from './services/websocketService.js'
import TwitchService from './services/twitchService.js'

// Routes
import apiRoutes from './routes/api.js'
import webhookRoutes, { setWebSocketService } from './routes/webhooks.js'
import staticRoutes from './routes/static.js'
import { setTwitchService } from './services/twitchEventService.js'

const app = express()
const port = config.port
const webSocketPort = config.webSocketPort
const streamerID = config.myChannelUserId
const eggUpdateInterval = config.eggUpdateInterval

// Initialize services
const websocketService = new WebSocketService(webSocketPort)
const twitchService = new TwitchService(websocketService)

// Set services for cross-service communication
setWebSocketService(websocketService)
setTwitchService(twitchService)

// Middleware
app.use(requestLogger)
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))

// Routes
app.use('/api', apiRoutes)
app.use('/', webhookRoutes)
app.use('/', staticRoutes)

// Swagger documentation
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile))

// Periodic tasks
setInterval(async function () {
  const stream = await twitchService.checkStreamStatus()
  
  // Clean up old TTS files
  findRemoveSync('/home/html/tts', { age: { seconds: 300 }, extensions: '.mp3' })
  
  if (stream) {
    // Future: Add periodic egg distribution for subscribers
    // Currently commented out in original code
  }
}, eggUpdateInterval)

// Startup
async function startServer() {
  try {
    // Check initial stream status
    if (await twitchService.isStreamLive(streamerID)) {
      logger.info('Stream status check', { status: 'online' })
    } else {
      logger.info('Stream status check', { status: 'offline' })
    }

    app.listen(port, () => {
      logger.info('Bot server started', { 
        port, 
        websocketPort: webSocketPort,
        environment: process.env.NODE_ENV || 'development',
        eggUpdateInterval: eggUpdateInterval / 60000 + ' minutes'
      })
    })

  } catch (error) {
    logger.error('Failed to start server', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...')
  try {
    await twitchService.disconnect()
    websocketService.close()
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', error)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...')
  try {
    await twitchService.disconnect()
    websocketService.close()
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', error)
    process.exit(1)
  }
})

startServer()