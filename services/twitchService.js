import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
import { ApiClient } from '@twurple/api'
import { promises as fs } from 'fs'
import fetch from 'node-fetch'
import logger from '../utils/logger.js'
import config from '../config.json' with { type: "json" }
import { eggUpdateCommand, getUserEggs, getEggLeaderboard } from './eggServicePostgres.js'
import { changeColourEvent } from './colourService.js'
import TTSService from './ttsService.js'
import CustomCommandsService from './customCommandsService.js'
import { getUserByUsername, getOrCreateUser } from './userService.js'

class TwitchService {
  constructor(websocketService) {
    this.websocketService = websocketService
    this.ttsService = new TTSService()
    this.customCommandsService = new CustomCommandsService(websocketService)
    this.poolService = null // Will be initialized asynchronously
    this.chatClient = null
    this.api = null
    this.authProvider = null
    this.chatters = new Map()

    this.boozieBotUserID = config.boozieBotUserID
    this.streamerID = config.myChannelUserId
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.myChannel = config.myChannel

    this.modlist = []
    this.init()
  }

  async init() {
    try {
      // Initialize pool service
      const PoolService = (await import('./poolService.js')).default
      this.poolService = new PoolService(process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require")
      
      // Initialize user merge service
      const UserMergeService = (await import('./userMergeService.js')).default
      this.userMergeService = new UserMergeService(process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require")
      
      // Load tokens and mod list
      const botTokenData = JSON.parse(await fs.readFile(`./tokens.${this.boozieBotUserID}.json`, 'UTF-8'))
      const channelTokenData = JSON.parse(await fs.readFile(`./tokens.${this.streamerID}.json`, 'UTF-8'))
      this.modlist = JSON.parse(await fs.readFile('./modList.json', 'UTF-8'))

      // Setup auth provider
      this.authProvider = new RefreshingAuthProvider({
        clientId: this.clientId,
        clientSecret: this.clientSecret
      })

      this.authProvider.onRefresh(async (userId, newTokenData) => {
        await fs.writeFile(`./tokens.${userId}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8')
        logger.info('Twitch tokens refreshed', { userId })
      })

      // Add bot token for chat
      await this.authProvider.addUserForToken(botTokenData, ['chat'])
      await this.authProvider.addUserForToken(botTokenData, ['user:read:subscriptions'])
      
      // Add channel owner token for moderation API calls
      await this.authProvider.addUserForToken(channelTokenData, ['moderation:read'])

      // Setup clients
      this.chatClient = new ChatClient({ authProvider: this.authProvider, channels: [this.myChannel] })
      this.api = new ApiClient({ authProvider: this.authProvider })

      // Setup chat message handler
      this.chatClient.onMessage(async (channel, user, message) => {
        logger.debug('Chat message received', { 
          userType: typeof user,
          userProperties: Object.keys(user || {}),
          userName: user?.userName,
          displayName: user?.displayName,
          userId: user?.userId,
          message: message.substring(0, 50) 
        })
        
        // Skip processing messages from the bot itself (if we can identify them)
        if (user?.userId === this.boozieBotUserID) {
          logger.debug('Skipping bot\'s own message', { botUserId: this.boozieBotUserID })
          return
        }
        
        // Handle case where user is just a string (username)
        if (typeof user === 'string') {
          await this.processMessage(user, message, null)
        } else {
          // Handle case where user is an object with properties
          // user.displayName should be the properly cased display name
          const displayName = user.displayName || user.userName || user.name || user
          await this.processMessage(displayName, message, user)
        }
      })

      await this.chatClient.connect()
      logger.info('Twitch chat client connected', { channel: this.myChannel })

      // Fetch initial chatters
      await this.fetchChatters()

    } catch (error) {
      logger.error('Failed to initialize Twitch service', error)
      throw error
    }
  }

  async fetchChatters() {
    try {
      const chatters = await this.api.asUser(this.boozieBotUserID, async ctx => {
        const viewerList = new Map()
        const viewers = await ctx.chat.getChatters(this.streamerID)
        logger.debug('Fetched chatters', { total: viewers.total })
        for (const chatter of viewers.data) {
          viewerList.set(chatter.userDisplayName, chatter.userId)
        }
        return viewerList
      })
      this.chatters = chatters
      logger.info('Chatters list updated', { count: this.chatters.size })
    } catch (error) {
      logger.error('Failed to fetch chatters', error)
    }
  }

  async isStreamLive(streamer) {
    try {
      const checkStream = await this.api.streams.getStreamByUserId(streamer)
      if (checkStream != null) {
        return checkStream.type
      } else {
        return false
      }
    } catch (error) {
      logger.error('Failed to check stream status', { streamer, error })
      return false
    }
  }

  sendChatMessage(message) {
    try {
      this.chatClient.say(this.myChannel, message)
      logger.debug('Chat message sent', { message })
    } catch (error) {
      logger.error('Failed to send chat message', { message, error })
    }
  }

  async isBotMod(username) {
    try {
      // Check if user is a moderator in the database
      const user = await getUserByUsername(username)
      if (!user) {
        return false
      }
      return user.is_moderator || user.is_admin
    } catch (error) {
      logger.error('Failed to check moderator status', { username, error })
      // Fallback to static list if database check fails
      return this.modlist.includes(username)
    }
  }

  async processMessage(displayName, message, userObj = null) {
    let unformattedMessage = message
    message = message.toLowerCase()

    logger.debug('Processing chat message', { user: displayName, message: message.substring(0, 100) })
    
    // Ensure user exists in database when they send a message
    try {
      if (userObj && userObj.userId) {
        // We have the real Twitch user ID from the chat event
        // Use the lowercase version of displayName for username consistency
        await getOrCreateUser(userObj.userId, displayName.toLowerCase(), displayName)
        
        // Also update our chatters list for future reference
        this.chatters.set(displayName, userObj.userId)
        
        logger.debug('Created/updated user with real Twitch ID', { 
          userId: userObj.userId, 
          username: displayName 
        })
      } else {
        // Try to get from chatters list first (case-insensitive)
        let userId = this.chatters.get(displayName) || this.chatters.get(displayName.toLowerCase())
        
        if (!userId) {
          // Try to fetch user ID from Twitch API
          try {
            const apiClient = this.api
            if (apiClient) {
              const twitchUser = await apiClient.users.getUserByName(displayName.toLowerCase())
              if (twitchUser) {
                userId = twitchUser.id
                // Update chatters list for future reference (both cases)
                this.chatters.set(displayName, userId)
                this.chatters.set(displayName.toLowerCase(), userId)
                logger.debug('Fetched Twitch user ID via API', { 
                  username: displayName, 
                  userId 
                })
              }
            } else {
              logger.debug('API client not available for user lookup', { username: displayName })
            }
          } catch (apiError) {
            logger.debug('Failed to fetch user ID from API', { 
              username: displayName, 
              error: apiError.message 
            })
          }
        }
        
        if (userId) {
          await getOrCreateUser(userId, displayName.toLowerCase(), displayName)
          logger.debug('Created/updated user with fetched Twitch ID', { 
            userId, 
            username: displayName 
          })
        } else {
          // Only warn if this isn't a known case where we expect to fail
          if (displayName.toLowerCase() !== 'streamelements' && 
              displayName.toLowerCase() !== 'nightbot' &&
              displayName.toLowerCase() !== 'streamlabs') {
            logger.warn('No Twitch user ID available for chat message', { 
              displayName,
              chattersListSize: this.chatters.size,
              hasApiClient: !!this.api
            })
          }
          // Skip user creation rather than create temp entries
          return
        }
      }
    } catch (error) {
      logger.error('Failed to create user from chat message', { user: displayName, error: error.message })
    }

    if (message.startsWith("!addeggs")) {
      if (await this.isBotMod(displayName)) {
        var messageBody = unformattedMessage.slice(8)
        var command = unformattedMessage.slice(-8)
        var stringArray = messageBody.match(/-?[a-zA-Z0-9]+/g)
        stringArray = stringArray.filter(item => item.trim() !== '')

        if (stringArray.length != 2) {
          this.sendChatMessage("Incorrect arguements, please use " + command + " username numberOfEggs")
          return
        }
        if (typeof Number(stringArray[0]) === 'number' && isNaN(Number(stringArray[1]))) {
          this.sendChatMessage("Command in wrong format, please use " + command + " username numberOfEggs")
          return
        } else {
          let eggsToAdd = Number(stringArray[1])
          let userToUpdate = stringArray[0]
            .replace(/[\u200B-\u200D\uFEFF\u00A0\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uF3A0]/g, '')
            .trim()
          
          // Try to get the Twitch user ID for the target user
          let targetTwitchUserId = null
          try {
            // Check if user is in chatters list
            targetTwitchUserId = this.chatters.get(userToUpdate)
            
            // If not in chatters, try API lookup
            if (!targetTwitchUserId) {
              const twitchUser = await this.api.users.getUserByName(userToUpdate)
              if (twitchUser) {
                targetTwitchUserId = twitchUser.id
              }
            }
          } catch (error) {
            logger.debug('Could not get Twitch ID for egg command target', { userToUpdate, error: error.message })
          }
          
          await eggUpdateCommand(userToUpdate, eggsToAdd, true, this.sendChatMessage.bind(this), targetTwitchUserId)
          return
        }
      } else {
        this.sendChatMessage("Get fucked " + displayName + ", you're not a mod cmonBruh")
        return
      }
    }

    if (message.startsWith("!tts")) {
      let toTts = message.slice(4)
      try {
        const ttsCreated = await this.ttsService.createTTSFile(toTts)
        const tts = {
          type: "tts",
          id: ttsCreated,
        }
        this.websocketService.broadcast(tts)
      } catch (error) {
        logger.error('TTS command failed', { user: displayName, message: toTts, error })
      }
      return
    }

    if (message.startsWith("!reloadcommands")) {
      if (await this.isBotMod(displayName)) {
        try {
          await this.customCommandsService.reloadCommands()
          this.sendChatMessage(`${displayName} - Custom commands reloaded successfully!`)
        } catch (error) {
          this.sendChatMessage(`${displayName} - Failed to reload commands: ${error.message}`)
          logger.error('Failed to reload commands', { user: displayName, error })
        }
      } else {
        this.sendChatMessage(`${displayName} - Only moderators can reload commands`)
      }
      return
    }

    if (message.startsWith("!commands")) {
      try {
        // Refresh cache if needed before getting commands
        if (this.customCommandsService.shouldRefreshCache()) {
          await this.customCommandsService.loadCommands()
        }
        
        const commands = this.customCommandsService.getAllCommands()
        const enabledCommands = commands.filter(cmd => cmd.enabled)
        
        if (enabledCommands.length === 0) {
          this.sendChatMessage(`${displayName} - No custom commands available yet!`)
        } else {
          // Group commands by permission level and sort
          const publicCommands = enabledCommands
            .filter(cmd => cmd.permission === 'everyone')
            .map(cmd => cmd.trigger)
            .sort()
          
          const restrictedCommands = enabledCommands
            .filter(cmd => cmd.permission !== 'everyone')
            .map(cmd => `${cmd.trigger} (${cmd.permission})`)
            .sort()
          
          let commandMessage = `${displayName} - Available commands: `
          
          if (publicCommands.length > 0) {
            commandMessage += publicCommands.join(', ')
          }
          
          if (restrictedCommands.length > 0) {
            if (publicCommands.length > 0) commandMessage += ' | '
            commandMessage += restrictedCommands.join(', ')
          }
          
          // Add built-in commands
          commandMessage += ' | Built-in: !eggs, !topeggs, !quote, !pool, !donate, !pools, !createpool (moderator), !mergeeggs (moderator)'
          
          // Truncate if too long for Twitch chat (500 char limit)
          if (commandMessage.length > 450) {
            commandMessage = commandMessage.substring(0, 447) + '...'
          }
          
          this.sendChatMessage(commandMessage)
        }
      } catch (error) {
        this.sendChatMessage(`${displayName} - Error loading commands list`)
        logger.error('Failed to get commands list', { user: displayName, error })
      }
      return
    }

    if (message.startsWith("!eggs")) {
      const messageBody = message.slice(5).trim()
      
      // !eggs @username or !eggs username - check someone else's eggs
      if (messageBody.length > 0) {
        const targetUsername = messageBody.replace('@', '')
          .replace(/[\u200B-\u200D\uFEFF\u00A0\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uF3A0]/g, '')
          .trim()
          .toLowerCase()
        
        try {
          // Try to get the target user's Twitch ID
          let targetTwitchUserId = this.chatters.get(targetUsername)
          
          // If not in chatters, try API lookup
          if (!targetTwitchUserId) {
            const twitchUser = await this.api.users.getUserByName(targetUsername)
            if (twitchUser) {
              targetTwitchUserId = twitchUser.id
            }
          }
          
          const userEggs = await getUserEggs(targetTwitchUserId || targetUsername)
          
          if (!userEggs) {
            this.sendChatMessage(`${displayName} - ${targetUsername} has no eggs yet!`)
          } else {
            this.sendChatMessage(`${displayName} - ${userEggs.username} has ${userEggs.eggsAmount.toLocaleString()} eggs 🥚`)
          }
        } catch (error) {
          this.sendChatMessage(`${displayName} - Could not find user ${targetUsername}`)
          logger.error('Failed to get eggs for user', { requestedBy: displayName, targetUser: targetUsername, error })
        }
      } else {
        // !eggs - check your own eggs
        try {
          const userInfo = await this.getUserInfo(displayName)
          const userEggs = await getUserEggs(userInfo.twitchUserId || displayName)
          
          if (!userEggs) {
            this.sendChatMessage(`${displayName} - You have no eggs yet! Keep chatting to earn some 🥚`)
          } else {
            this.sendChatMessage(`${displayName} - You have ${userEggs.eggsAmount.toLocaleString()} eggs 🥚`)
          }
        } catch (error) {
          this.sendChatMessage(`${displayName} - Could not check your eggs`)
          logger.error('Failed to get eggs for user', { user: displayName, error })
        }
      }
      return
    }

    if (message.startsWith("!topeggs")) {
      try {
        const leaderboard = await getEggLeaderboard(5)
        
        if (leaderboard.length === 0) {
          this.sendChatMessage(`${displayName} - No egg data available yet!`)
        } else {
          const topUsers = leaderboard.map((user, index) => 
            `${index + 1}. ${user.username} (${user.eggs_amount.toLocaleString()})`
          ).join(', ')
          this.sendChatMessage(`${displayName} - Top Egg Collectors: ${topUsers} 🥚`)
        }
      } catch (error) {
        this.sendChatMessage(`${displayName} - Could not load egg leaderboard`)
        logger.error('Failed to get egg leaderboard', { user: displayName, error })
      }
      return
    }

    // Pool commands
    if (message.startsWith("!pool ")) {
      const args = message.substring(6).trim().split(' ')
      const poolName = args[0]
      
      if (!poolName) {
        this.sendChatMessage(`${displayName} - Usage: !pool <poolname>`)
        return
      }
      
      try {
        const pool = await this.poolService.getPool(poolName)
        if (!pool) {
          this.sendChatMessage(`${displayName} - Pool "${poolName}" not found`)
        } else {
          this.sendChatMessage(`${displayName} - Pool "${pool.pool_name}" has ${pool.eggs_amount.toLocaleString()} eggs from ${pool.unique_donors || 0} donors 🥚`)
        }
      } catch (error) {
        this.sendChatMessage(`${displayName} - Could not check pool`)
        logger.error('Failed to get pool info', { user: displayName, poolName, error })
      }
      return
    }

    if (message.startsWith("!donate ")) {
      const args = message.substring(8).trim().split(' ')
      const poolName = args[0]
      const amount = parseInt(args[1])
      
      if (!poolName || !amount || amount < 1) {
        this.sendChatMessage(`${displayName} - Usage: !donate <poolname> <amount>`)
        return
      }
      
      try {
        const userInfo = await this.getUserInfo(displayName)
        const result = await this.poolService.donateToPool(
          poolName,
          userInfo.twitchUserId || userInfo.userId,
          displayName,
          amount
        )
        
        this.sendChatMessage(`${displayName} donated ${amount} eggs to pool "${result.poolName}"! Pool total: ${result.newPoolTotal.toLocaleString()} 🥚`)
      } catch (error) {
        if (error.message === 'Pool not found') {
          this.sendChatMessage(`${displayName} - Pool "${poolName}" not found`)
        } else if (error.message === 'Insufficient eggs') {
          this.sendChatMessage(`${displayName} - You don't have enough eggs to donate ${amount}`)
        } else if (error.message === 'Pool is not active') {
          this.sendChatMessage(`${displayName} - Pool "${poolName}" is not active`)
        } else {
          this.sendChatMessage(`${displayName} - Could not process donation`)
          logger.error('Failed to donate to pool', { user: displayName, poolName, amount, error })
        }
      }
      return
    }

    if (message.startsWith("!pools")) {
      try {
        const pools = await this.poolService.getAllPools()
        
        if (pools.length === 0) {
          this.sendChatMessage(`${displayName} - No active pools available`)
        } else {
          const poolList = pools.slice(0, 3).map(pool => 
            `${pool.pool_name} (${pool.eggs_amount.toLocaleString()})`
          ).join(', ')
          const moreText = pools.length > 3 ? ` and ${pools.length - 3} more` : ''
          this.sendChatMessage(`${displayName} - Active pools: ${poolList}${moreText}`)
        }
      } catch (error) {
        this.sendChatMessage(`${displayName} - Could not list pools`)
        logger.error('Failed to list pools', { user: displayName, error })
      }
      return
    }

    if (message.startsWith("!createpool ")) {
      const userInfo = await this.getUserInfo(displayName)
      
      if (!userInfo.isModerator && !userInfo.isBroadcaster) {
        this.sendChatMessage(`${displayName} - Only moderators can create pools`)
        return
      }
      
      const args = message.substring(12).trim()
      const poolName = args.split(' ')[0]
      const description = args.substring(poolName.length).trim()
      
      if (!poolName) {
        this.sendChatMessage(`${displayName} - Usage: !createpool <poolname> [description]`)
        return
      }
      
      try {
        const pool = await this.poolService.createPool(
          poolName,
          description,
          userInfo.twitchUserId || userInfo.userId,
          displayName
        )
        
        this.sendChatMessage(`${displayName} created pool "${pool.pool_name}"! Start donating with !donate ${pool.pool_name} <amount>`)
      } catch (error) {
        if (error.message === 'Pool name already exists') {
          this.sendChatMessage(`${displayName} - Pool name already exists`)
        } else {
          this.sendChatMessage(`${displayName} - Could not create pool`)
          logger.error('Failed to create pool', { user: displayName, poolName, error })
        }
      }
      return
    }

    if (message.startsWith("!mergeeggs ")) {
      const userInfo = await this.getUserInfo(displayName)
      
      if (!userInfo.isModerator && !userInfo.isBroadcaster) {
        this.sendChatMessage(`${displayName} - Only moderators can merge user eggs`)
        return
      }
      
      const args = message.substring(11).trim().split(' ')
      const fromUser = args[0]
      const toUser = args[1]
      const reason = args.slice(2).join(' ') || 'Moderator merge via chat'
      
      if (!fromUser || !toUser) {
        this.sendChatMessage(`${displayName} - Usage: !mergeeggs <fromUser> <toUser> [reason]`)
        return
      }
      
      if (fromUser.toLowerCase() === toUser.toLowerCase()) {
        this.sendChatMessage(`${displayName} - Cannot merge user with themselves`)
        return
      }
      
      try {
        // Preview the merge first
        const preview = await this.userMergeService.previewMerge(fromUser, toUser)
        
        if (preview.sourceUser.currentEggs === 0) {
          this.sendChatMessage(`${displayName} - ${fromUser} has no eggs to transfer`)
          return
        }
        
        // Execute the merge
        const adminTwitchId = userInfo.twitchUserId || userInfo.userId || displayName
        const result = await this.userMergeService.mergeUserEggs(
          fromUser,
          toUser,
          adminTwitchId,
          displayName,
          reason,
          false // Don't delete source account via chat command
        )
        
        this.sendChatMessage(`${displayName} successfully merged ${result.sourceUser.eggsTransferred.toLocaleString()} eggs from ${result.sourceUser.username} to ${result.targetUser.username}. New total: ${result.targetUser.newTotal.toLocaleString()} eggs`)
        
      } catch (error) {
        if (error.message.includes('not found')) {
          this.sendChatMessage(`${displayName} - User not found: ${error.message}`)
        } else {
          this.sendChatMessage(`${displayName} - Could not merge eggs: ${error.message}`)
          logger.error('Failed to merge eggs via chat', { user: displayName, fromUser, toUser, error })
        }
      }
      return
    }

    // Quote commands
    if (message.toLowerCase().startsWith('!quote')) {
      const args = message.substring(6).trim()
      
      // Get specific quote by ID or random quote
      if (message.toLowerCase() === '!quote' || /^!quote\s+\d+$/.test(message.toLowerCase())) {
        try {
          const QuotesService = (await import('./database/quotesService.js')).QuotesService
          
          let quote
          if (args && !isNaN(args)) {
            // Get specific quote by ID
            quote = await QuotesService.getQuoteById(parseInt(args))
            if (!quote) {
              this.sendChatMessage(`${displayName} - Quote #${args} not found`)
              return
            }
          } else {
            // Get random quote
            quote = await QuotesService.getRandomQuote()
            if (!quote) {
              this.sendChatMessage(`${displayName} - No quotes available yet!`)
              return
            }
          }
          
          // Format date
          const quoteDate = new Date(quote.date_said).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })
          
          this.sendChatMessage(`Quote #${quote.id}: "${quote.quote_text}" - ${quote.quoted_by}, ${quoteDate}`)
        } catch (error) {
          this.sendChatMessage(`${displayName} - Error retrieving quote`)
          logger.error('Failed to get quote', { user: displayName, error })
        }
        return
      }
    }

    // Add quote command (moderator only)
    if (message.toLowerCase().startsWith('!addquote ')) {
      const userInfo = await this.getUserInfo(displayName)
      
      if (!userInfo.isModerator && !userInfo.isBroadcaster) {
        this.sendChatMessage(`${displayName} - Only moderators can add quotes`)
        return
      }
      
      const quoteText = message.substring(10).trim()
      
      if (!quoteText) {
        this.sendChatMessage(`${displayName} - Please provide quote text: !addquote <quote>`)
        return
      }
      
      try {
        const QuotesService = (await import('./database/quotesService.js')).QuotesService
        const quote = await QuotesService.addQuote(
          quoteText,
          this.streamerName || 'Unknown',
          displayName,
          userInfo.userId
        )
        
        this.sendChatMessage(`${displayName} - Quote #${quote.id} added successfully!`)
        logger.info(`Quote added by ${displayName}`, { quoteId: quote.id })
      } catch (error) {
        this.sendChatMessage(`${displayName} - Failed to add quote`)
        logger.error('Failed to add quote', { user: displayName, error })
      }
      return
    }

    // Delete quote command (moderator only)
    if (message.toLowerCase().startsWith('!delquote ')) {
      const userInfo = await this.getUserInfo(displayName)
      
      if (!userInfo.isModerator && !userInfo.isBroadcaster) {
        this.sendChatMessage(`${displayName} - Only moderators can delete quotes`)
        return
      }
      
      const quoteId = message.substring(10).trim()
      
      if (!quoteId || isNaN(quoteId)) {
        this.sendChatMessage(`${displayName} - Please provide a valid quote ID: !delquote <id>`)
        return
      }
      
      try {
        const QuotesService = (await import('./database/quotesService.js')).QuotesService
        const deletedQuote = await QuotesService.deleteQuote(parseInt(quoteId))
        
        if (!deletedQuote) {
          this.sendChatMessage(`${displayName} - Quote #${quoteId} not found`)
        } else {
          this.sendChatMessage(`${displayName} - Quote #${quoteId} deleted successfully`)
          logger.info(`Quote deleted by ${displayName}`, { quoteId })
        }
      } catch (error) {
        this.sendChatMessage(`${displayName} - Failed to delete quote`)
        logger.error('Failed to delete quote', { user: displayName, error })
      }
      return
    }

    // Check for custom commands (both ! prefix and pattern-based)
    try {
      const matchingCommand = await this.customCommandsService.findMatchingCommand(message)

      if (matchingCommand) {
        // Get user information for permission checking
        const userInfo = await this.getUserInfo(displayName)

        const executed = await this.customCommandsService.executeCommand(
          matchingCommand.trigger,
          displayName,
          userInfo,
          this.sendChatMessage.bind(this)
        )

        if (executed) {
          return // Command was executed successfully
        }
      }
    } catch (error) {
      logger.error('Custom command processing failed', { user: displayName, message, error })
    }
  }

  async checkStreamStatus() {
    const isLive = await this.isStreamLive(this.streamerID)
    if (isLive) {
      logger.debug('Periodic stream check', { status: 'online' })
    } else {
      logger.debug('Periodic stream check', { status: 'offline' })
    }
    return isLive
  }

  getChatters() {
    return this.chatters
  }

  /**
   * Get user information for permission checking
   */
  async getUserInfo(username) {
    try {
      // Get user from database
      const user = await getUserByUsername(username)

      return {
        username: username,
        displayName: user?.display_name || username,
        channel: this.myChannel,
        isModerator: user?.is_moderator || this.modlist.includes(username),
        isSubscriber: user?.is_subscriber || false,
        isVip: user?.is_vip || false,
        isAdmin: user?.is_admin || false
      }
    } catch (error) {
      logger.error('Failed to get user info', { username, error })

      // Fallback to basic info
      return {
        username: username,
        displayName: username,
        channel: this.myChannel,
        isModerator: this.isBotMod(username),
        isSubscriber: false,
        isVip: false,
        isAdmin: false
      }
    }
  }

  /**
   * Reload custom commands from database
   */
  async reloadCustomCommands() {
    try {
      await this.customCommandsService.reloadCommands()
      logger.info('Commands automatically reloaded via API')
    } catch (error) {
      logger.error('Failed to auto-reload commands', {
        error: error.message
      })
    }
  }

  async disconnect() {
    if (this.chatClient) {
      await this.chatClient.quit()
      logger.info('Twitch chat client disconnected')
    }
  }

  getApiClient() {
    return this.api
  }
}

export default TwitchService