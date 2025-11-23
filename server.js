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
    app.use('/api/pools', (await import('./routes/pools.js')).default)
    app.use('/api/user-merge', (await import('./routes/userMerge.js')).default)
    app.use('/', webhookRoutes)
    app.use('/', staticRoutes)

    // Chat view HTML page
    app.get('/chat', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mirrored Chat - Teleprompter View</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #000;
            color: #fff;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            height: 100vh;
            overflow: hidden;
            transform: scaleX(-1); /* Mirror by default for teleprompter */
        }
        
        .chat-container {
            height: 100vh;
            display: flex;
            flex-direction: column;
            padding: 70px 20px 20px 20px;
            overflow: hidden;
        }
        
        .connection-status {
            text-align: center;
            color: #fbbf24;
            padding: 20px;
            font-size: 18px;
        }
        
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .chat-message {
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            word-wrap: break-word;
            font-size: 24px;
            line-height: 1.4;
        }
        
        .chat-message.broadcaster {
            background: rgba(16, 185, 129, 0.15);
            border-left: 3px solid #10b981;
        }
        
        .chat-message.mod {
            background: rgba(139, 92, 246, 0.15);
            border-left: 3px solid #8b5cf6;
        }
        
        .chat-message.vip {
            background: rgba(236, 72, 153, 0.15);
            border-left: 3px solid #ec4899;
        }
        
        .chat-message.sub {
            background: rgba(251, 191, 36, 0.15);
            border-left: 3px solid #fbbf24;
        }
        
        .chat-message.redemption {
            background: rgba(147, 51, 234, 0.15);
            border-left: 3px solid #9333ea;
            border-radius: 12px;
            padding: 12px 16px;
        }
        
        .redemption-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        
        .redemption-icon {
            font-size: 1.2em;
        }
        
        .redemption-title {
            color: #c084fc;
            font-weight: bold;
            font-size: 0.9em;
        }
        
        .redemption-user {
            color: #9ca3af;
            font-size: 0.9em;
        }
        
        .redemption-input {
            color: #f3f4f6;
            margin-top: 4px;
            font-style: italic;
        }
        
        .chat-author {
            font-weight: bold;
            margin-right: 8px;
        }
        
        .chat-text {
            color: #f3f4f6;
        }
        
        .chat-text img {
            height: 1.5em;
            vertical-align: middle;
            margin: 0 2px;
            display: inline-block;
        }
        
        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            padding: 10px;
            border-radius: 8px;
            transform: scaleX(-1); /* Un-mirror controls */
            display: flex;
            gap: 10px;
            align-items: center;
            z-index: 1000;
        }
        
        .clock {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.8);
            padding: 10px 15px;
            border-radius: 8px;
            color: #fff;
            font-size: 24px;
            font-weight: bold;
            font-family: monospace;
            z-index: 1000;
        }
        
        .control-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .control-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        .font-size-display {
            color: #9ca3af;
            font-size: 14px;
            min-width: 50px;
            text-align: center;
        }
        
        /* Scrollbar styling */
        .chat-messages::-webkit-scrollbar {
            width: 8px;
        }
        
        .chat-messages::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .chat-messages::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div id="connectionStatus" class="connection-status">
            🔄 Connecting to chat...
        </div>
        <div id="chatMessages" class="chat-messages"></div>
    </div>
    
    <div class="clock" id="clock"></div>
    
    <div class="controls">
        <button class="control-btn" onclick="toggleMirror()">Toggle Mirror</button>
        <button class="control-btn" onclick="changeFontSize(-2)">A-</button>
        <span class="font-size-display" id="fontSizeDisplay">24px</span>
        <button class="control-btn" onclick="changeFontSize(2)">A+</button>
        <button class="control-btn" onclick="clearChat()">Clear</button>
    </div>

    <script>
        let websocket = null;
        let connected = false;
        let messages = [];
        let fontSize = 24;
        let mirrored = true;
        const maxMessages = 50;
        let emotes = [];
        
        // Store user colors (fallback to generated if no Twitch color)
        const userColors = {};
        function getUserColor(username, twitchColor) {
            // Use Twitch color if available
            if (twitchColor) {
                return twitchColor;
            }
            
            // Otherwise generate and cache a color
            if (!userColors[username]) {
                const hue = Math.floor(Math.random() * 360);
                userColors[username] = \`hsl(\${hue}, 70%, 60%)\`;
            }
            return userColors[username];
        }
        
        // Process message fragments (mix of text and emotes)
        function processMessageFragments(fragments) {
            if (!fragments || !Array.isArray(fragments)) {
                // Fallback for old format - just return the text
                return fragments || '';
            }
            
            return fragments.map(fragment => {
                if (fragment.type === 'emote') {
                    const emote = fragment.content;
                    return \`<img src="\${emote.url}" alt="\${emote.name}" title="\${emote.name}" style="height: 1.5em; vertical-align: middle; margin: 0 2px;">\`;
                } else {
                    // Text fragment - escape HTML
                    return fragment.content.replace(/[&<>"']/g, function(match) {
                        const escapes = {
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            '"': '&quot;',
                            "'": '&#x27;'
                        };
                        return escapes[match];
                    });
                }
            }).join('');
        }
        
        function connectWebSocket() {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsHost = \`\${wsProtocol}//\${window.location.host}/websocket/\`;
            
            try {
                websocket = new WebSocket(wsHost);
                
                websocket.onopen = () => {
                    console.log('Connected to chat WebSocket');
                    connected = true;
                    document.getElementById('connectionStatus').style.display = 'none';
                };
                
                websocket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Handle emote data
                        if (data.type === 'emotes' && data.emotes) {
                            emotes = data.emotes;
                            console.log(\`Loaded \${emotes.length} emotes\`);
                        }
                        // Handle batch messages
                        else if (data.type === 'batch' && data.messages) {
                            data.messages.forEach(msg => {
                                if (msg.type === 'chat') {
                                    addMessage(msg);
                                } else if (msg.type === 'redemption') {
                                    addRedemption(msg);
                                }
                            });
                        }
                        // Handle single chat messages
                        else if (data.type === 'chat') {
                            addMessage(data);
                        }
                        // Handle channel point redemptions
                        else if (data.type === 'redemption') {
                            addRedemption(data);
                        }
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
                
                websocket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    connected = false;
                    showConnectionStatus('❌ Connection error');
                };
                
                websocket.onclose = () => {
                    console.log('WebSocket connection closed');
                    connected = false;
                    showConnectionStatus('🔄 Reconnecting...');
                    
                    // Attempt to reconnect after 3 seconds
                    setTimeout(connectWebSocket, 3000);
                };
            } catch (error) {
                console.error('Failed to create WebSocket connection:', error);
                showConnectionStatus('❌ Failed to connect');
            }
        }
        
        function showConnectionStatus(message) {
            const status = document.getElementById('connectionStatus');
            status.textContent = message;
            status.style.display = 'block';
        }
        
        function addMessage(data) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            
            // Add special styling for roles
            if (data.isBroadcaster) messageDiv.classList.add('broadcaster');
            else if (data.isMod) messageDiv.classList.add('mod');
            else if (data.isVip) messageDiv.classList.add('vip');
            else if (data.isSubscriber) messageDiv.classList.add('sub');
            
            const authorColor = getUserColor(data.user, data.color);
            const processedMessage = processMessageFragments(data.parsedMessage);
            messageDiv.innerHTML = \`
                <span class="chat-author" style="color: \${authorColor}">\${data.user}:</span>
                <span class="chat-text">\${processedMessage}</span>
            \`;
            
            const chatContainer = document.getElementById('chatMessages');
            chatContainer.appendChild(messageDiv);
            
            // Remove old messages if we exceed the limit
            const messageElements = chatContainer.children;
            if (messageElements.length > maxMessages) {
                chatContainer.removeChild(messageElements[0]);
            }
            
            // Auto-scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function addRedemption(data) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message redemption';
            
            let redemptionHTML = \`
                <div class="redemption-header">
                    <span class="redemption-icon">🎯</span>
                    <span class="redemption-title">\${data.rewardTitle}</span>
                    <span class="redemption-user">by \${data.user}</span>
                </div>
            \`;
            
            // Add user input if provided
            if (data.userInput && data.userInput.trim() !== '') {
                redemptionHTML += \`<div class="redemption-input">\${data.userInput}</div>\`;
            }
            
            messageDiv.innerHTML = redemptionHTML;
            
            const chatContainer = document.getElementById('chatMessages');
            chatContainer.appendChild(messageDiv);
            
            // Remove old messages if we exceed the limit
            const messageElements = chatContainer.children;
            if (messageElements.length > maxMessages) {
                chatContainer.removeChild(messageElements[0]);
            }
            
            // Auto-scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function toggleMirror() {
            mirrored = !mirrored;
            document.body.style.transform = mirrored ? 'scaleX(-1)' : 'scaleX(1)';
        }
        
        function changeFontSize(delta) {
            const newSize = fontSize + delta;
            if (newSize >= 12 && newSize <= 48) {
                fontSize = newSize;
                document.getElementById('fontSizeDisplay').textContent = fontSize + 'px';
                document.querySelectorAll('.chat-message').forEach(msg => {
                    msg.style.fontSize = fontSize + 'px';
                });
                // Update emote sizes
                document.querySelectorAll('.chat-text img').forEach(img => {
                    img.style.height = '1.5em';
                });
            }
        }
        
        function clearChat() {
            document.getElementById('chatMessages').innerHTML = '';
        }
        
        // Clock function
        function updateClock() {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            document.getElementById('clock').textContent = \`\${hours}:\${minutes}:\${seconds}\`;
        }
        
        // Start clock
        updateClock();
        setInterval(updateClock, 1000);
        
        // Start connection
        connectWebSocket();
        
        // Add test message in development
        if (window.location.hostname === 'localhost') {
            setTimeout(() => {
                addMessage({
                    user: 'Maddeth',
                    message: 'Welcome to the mirrored chat view! 🎬',
                    isBroadcaster: true
                });
                setTimeout(() => {
                    addMessage({
                        user: 'TestMod',
                        message: 'This is perfect for teleprompter use!',
                        isMod: true
                    });
                }, 1000);
            }, 1000);
        }
    </script>
</body>
</html>
      `)
    })

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