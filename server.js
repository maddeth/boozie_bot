import bodyParser from 'body-parser'
import express from 'express'
import findRemoveSync from 'find-remove'
import swaggerUi from 'swagger-ui-express'
import swaggerFile from './swagger-output.json' with { type: "json" }

import logger from './utils/logger.js'
import config from './config.json' with { type: "json" }
import { requestLogger } from './middleware/requestLogger.js'

// Services
import WebSocketService from './services/websocketService.js'
import TwitchService from './services/twitchService.js'
import { eggUpdateCommand } from './services/eggServicePostgres.js'
import { subLookup } from './utils/getSubs.js'
import { syncModerators, syncSubscribers } from './services/moderatorSyncService.js'
import { getOrCreateUser } from './services/userService.js'

// Routes
import apiRoutes from './routes/api.js'
import webhookRoutes, { setWebSocketService } from './routes/webhooks.js'
import { setTwitchService as setCommandsTwitchService } from './routes/commands.js'
import staticRoutes from './routes/static.js'
import eggsRoutes from './routes/eggs.js'
import alertsRoutes from './routes/alerts.js'
import { setTwitchService } from './services/twitchEventService.js'

const app = express()
const port = config.port
const webSocketPort = config.webSocketPort
const streamerID = config.myChannelUserId
const eggUpdateInterval = config.eggUpdateInterval

async function startServer() {
  try {
    // Initialize services
    const websocketService = new WebSocketService(webSocketPort)
    const twitchService = new TwitchService(websocketService)

    // Wait for TwitchService to initialize
    await new Promise((resolve) => {
      const checkInit = setInterval(() => {
        if (twitchService.api) {
          clearInterval(checkInit)
          resolve()
        }
      }, 100)
    })

    logger.info('TwitchService initialized successfully')

    // Set services for cross-service communication
    setWebSocketService(websocketService)
    setCommandsTwitchService(twitchService)
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
    app.use('/api/eggs', eggsRoutes)
    app.use('/api/alerts', alertsRoutes)
    app.use('/', webhookRoutes)
    app.use('/', staticRoutes)

    // Swagger documentation
    app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile))

    // Start periodic tasks only after TwitchService is ready
    setInterval(async function () {
      const stream = await twitchService.checkStreamStatus()

      // Clean up old TTS files
      findRemoveSync('/home/html/tts', { age: { seconds: 300 }, extensions: '.mp3' })

      if (stream) {
        // Reward subscribers with eggs every 15 minutes while stream is live
        try {
          const chatters = twitchService.getChatters()
          let chattersRewarded = 0

          logger.info('Periodic chatter egg distribution starting', {
            totalChatters: chatters.size,
            streamLive: true
          })

          for (const [displayName, userId] of chatters) {
            try {
              const tier = await subLookup(displayName, userId)

              // Base eggs for everyone, bonus for subscribers
              let eggReward = 5 // Base reward for all chatters
              switch (tier) {
                case "0": eggReward = 5; break      // Non-sub: 5 eggs
                case "1000": eggReward = 10; break  // Tier 1: 10 eggs (5 base + 5 bonus)
                case "2000": eggReward = 15; break  // Tier 2: 15 eggs (5 base + 10 bonus)
                case "3000": eggReward = 20; break  // Tier 3: 20 eggs (5 base + 15 bonus)
                default: eggReward = 5; break       // Default: 5 eggs
              }

              // Ensure user exists in database for role tracking
              await getOrCreateUser(userId, displayName.toLowerCase(), displayName)

              // Award eggs (silent mode - no chat message)
              await eggUpdateCommand(displayName, eggReward, false, null, userId)
              chattersRewarded++

              logger.info('Chatter egg reward granted', {
                user: displayName,
                userId: userId,
                tier: tier,
                eggsAwarded: eggReward
              })
            } catch (subError) {
              logger.warn('Failed to process chatter for egg distribution', {
                user: displayName,
                userId: userId,
                error: subError.message
              })
            }
          }

          logger.info('Chatter egg distribution completed', {
            totalChatters: chatters.size,
            chattersRewarded,
            streamLive: true
          })

        } catch (error) {
          logger.error('Error during periodic chatter egg distribution', {
            error: error.message
          })
        }

        // Sync subscriber status for current chatters (only while live)
        try {
          const subSyncResult = await syncSubscribers(twitchService, subLookup)
          if (subSyncResult.success) {
            logger.info('Subscriber sync completed', {
              synced: subSyncResult.synced,
              errors: subSyncResult.errors,
              streamLive: true
            })
          }
        } catch (error) {
          logger.error('Error during subscriber sync', {
            error: error.message
          })
        }
      }

      // Sync moderator privileges regardless of stream status (runs every 15 minutes)
      try {
        logger.info('Starting periodic moderator sync', {
          streamLive: !!stream
        })

        // Update chatter list if stream is live
        if (stream) {
          await twitchService.fetchChatters()
        }

        // Sync moderators from Twitch API
        const modSyncResult = await syncModerators(twitchService, config.myChannelUserId)
        if (modSyncResult.success) {
          logger.info('Moderator sync completed', {
            added: modSyncResult.added,
            removed: modSyncResult.removed,
            total: modSyncResult.totalTwitchMods,
            streamLive: !!stream
          })
        }
      } catch (error) {
        logger.error('Error during periodic moderator sync', {
          error: error.message
        })
      }
    }, eggUpdateInterval)

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

    // Return services for graceful shutdown
    return { twitchService, websocketService }

  } catch (error) {
    logger.error('Failed to start server', error)
    process.exit(1)
  }
}

// Start the server and get services for shutdown
let services = null
startServer().then((result) => {
  services = result
})

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...')
  try {
    if (services) {
      await services.twitchService.disconnect()
      services.websocketService.close()
    }
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', error)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...')
  try {
    if (services) {
      await services.twitchService.disconnect()
      services.websocketService.close()
    }
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', error)
    process.exit(1)
  }
})