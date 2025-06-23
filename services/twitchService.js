import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
import { ApiClient } from '@twurple/api'
import { promises as fs } from 'fs'
import fetch from 'node-fetch'
import logger from '../logger.js'
import config from '../config.json' with { type: "json" }
import { eggUpdateCommand } from './eggService.js'
import { changeColourEvent } from './colourService.js'
import TTSService from './ttsService.js'

class TwitchService {
  constructor(websocketService) {
    this.websocketService = websocketService
    this.ttsService = new TTSService()
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
      // Load token and mod list
      const tokenData = JSON.parse(await fs.readFile(`./tokens.${this.boozieBotUserID}.json`, 'UTF-8'))
      this.modlist = JSON.parse(await fs.readFile('./modList.json', 'UTF-8'))

      // Setup auth provider
      this.authProvider = new RefreshingAuthProvider({ 
        clientId: this.clientId, 
        clientSecret: this.clientSecret 
      })

      this.authProvider.onRefresh(async (boozieBotUserID, newTokenData) => {
        await fs.writeFile(`./tokens.${boozieBotUserID}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8')
        logger.info('Twitch tokens refreshed', { userId: boozieBotUserID })
      })

      await this.authProvider.addUserForToken(tokenData, ['chat'])
      await this.authProvider.addUserForToken(tokenData, ['user:read:subscriptions'])

      // Setup clients
      this.chatClient = new ChatClient({ authProvider: this.authProvider, channels: [this.myChannel] })
      this.api = new ApiClient({ authProvider: this.authProvider })

      // Setup chat message handler
      this.chatClient.onMessage(async (channel, user, message) => {
        await this.processMessage(user, message)
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

  isBotMod(modName) {
    return this.modlist.includes(modName)
  }

  async processMessage(user, message) {
    let unformattedMessage = message
    message = message.toLowerCase()

    logger.debug('Processing chat message', { user, message: message.substring(0, 100) })

    if (message.startsWith("!colourlist") || message.startsWith("!colorlist") || message.startsWith("!colours")) {
      this.sendChatMessage(user + " - you can find the colour list here " + config.webAddress + "/colours")
      return
    }

    if (message.startsWith("!test")) {
      this.sendChatMessage(user + "icles")
      return
    }

    if (message.startsWith("!list")) {
      logger.debug('Chat command: list', { chattersCount: this.chatters.size })
      return
    }

    if (message.startsWith("!eggstest")) {
      if (this.isBotMod(user)) {
        var messageBody = unformattedMessage.slice(9)
        var command = unformattedMessage.slice(-9)
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
          await eggUpdateCommand(userToUpdate, eggsToAdd, true, this.sendChatMessage.bind(this))
          return
        }
      } else {
        this.sendChatMessage("Get fucked " + user + ", you're not a mod cmonBruh")
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
        logger.error('TTS command failed', { user, message: toTts, error })
      }
      return
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

  async disconnect() {
    if (this.chatClient) {
      await this.chatClient.quit()
      logger.info('Twitch chat client disconnected')
    }
  }
}

export default TwitchService