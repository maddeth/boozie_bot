import fetch from 'node-fetch'
import logger from '../utils/logger.js'

class ChatGPTService {
  constructor(ttsService, websocketService) {
    this.ttsService = ttsService
    this.websocketService = websocketService
    this.apiKey = null
    this.model = 'gpt-4o-mini'
    this.maxTokens = 150
    this.temperature = 0.8
    this.systemPrompt = `You are boozie-bot, a passive-aggressive chat bot in Maddeth's Twitch stream. You deliver subtle roasts and backhanded compliments. Maximum 200 characters. You don't use emotes.`

    // User context management
    this.userContexts = new Map()
    this.maxContextMessages = 5

    // Rate limiting
    this.userCooldowns = new Map()
    this.cooldownDuration = 30000 // 30 seconds per user

    // Response moderation
    this.maxResponseLength = 200 // characters for TTS
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey
  }

  isConfigured() {
    return !!this.apiKey
  }

  // Check if user is on cooldown
  isUserOnCooldown(username) {
    const lastUse = this.userCooldowns.get(username)
    if (!lastUse) return false

    const timeSinceLastUse = Date.now() - lastUse
    return timeSinceLastUse < this.cooldownDuration
  }

  // Get remaining cooldown time in seconds
  getRemainingCooldown(username) {
    const lastUse = this.userCooldowns.get(username)
    if (!lastUse) return 0

    const timeSinceLastUse = Date.now() - lastUse
    const remaining = this.cooldownDuration - timeSinceLastUse
    return Math.max(0, Math.ceil(remaining / 1000))
  }

  // Add message to user context
  addToContext(username, role, content) {
    if (!this.userContexts.has(username)) {
      this.userContexts.set(username, [])
    }

    const context = this.userContexts.get(username)
    context.push({ role, content })

    // Keep only recent messages
    if (context.length > this.maxContextMessages * 2) {
      this.userContexts.set(username, context.slice(-this.maxContextMessages * 2))
    }
  }

  // Get user context for API call
  getUserContext(username) {
    const context = this.userContexts.get(username) || []
    return context.slice(-this.maxContextMessages * 2)
  }

  // Clear user context
  clearUserContext(username) {
    this.userContexts.delete(username)
  }

  // Generate ChatGPT response and send to TTS
  async processAIRequest(username, message) {
    try {
      // Check cooldown
      if (this.isUserOnCooldown(username)) {
        const remaining = this.getRemainingCooldown(username)
        return {
          success: false,
          error: `Please wait ${remaining} seconds before using !ai again`
        }
      }

      // Check configuration
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'ChatGPT is not configured yet'
        }
      }

      // Add user message to context
      this.addToContext(username, 'user', message)

      // Prepare messages for API
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.getUserContext(username)
      ]

      logger.info('Sending ChatGPT request', {
        user: username,
        message: message.substring(0, 50)
      })

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          user: username
        })
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error('ChatGPT API error', {
          status: response.status,
          error
        })
        return {
          success: false,
          error: 'Failed to get AI response'
        }
      }

      const data = await response.json()
      const aiResponse = data.choices[0]?.message?.content || ''

      // Truncate if too long for TTS
      let ttsText = aiResponse
      if (ttsText.length > this.maxResponseLength) {
        ttsText = ttsText.substring(0, this.maxResponseLength - 3) + '...'
      }

      // Add AI response to context
      this.addToContext(username, 'assistant', aiResponse)

      // Send to TTS
      logger.info('Sending AI response to TTS', {
        user: username,
        responseLength: ttsText.length
      })

      const ttsId = await this.ttsService.createTTSFile(ttsText)

      // Broadcast TTS event
      if (this.websocketService) {
        try {
          this.websocketService.broadcast({
            type: 'tts',
            id: ttsId,
            source: 'chatgpt',
            user: username,
            text: ttsText
          })
        } catch (wsError) {
          logger.warn('WebSocket broadcast failed for ChatGPT TTS', { user: username, ttsId, error: wsError.message })
          // Continue execution - don't let WebSocket errors break the success flow
        }
      }

      // Update cooldown
      this.userCooldowns.set(username, Date.now())

      return {
        success: true,
        response: aiResponse,
        ttsId,
        chatResponse: ttsText // Return the text to be sent to chat
      }

    } catch (error) {
      logger.error('ChatGPT processing error', {
        user: username,
        error: error.message,
        stack: error.stack
      })
      return {
        success: false,
        error: 'An error occurred processing your request'
      }
    }
  }

  // Admin commands
  setModel(model) {
    this.model = model
    logger.info('ChatGPT model updated', { model })
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt
    logger.info('ChatGPT system prompt updated')
  }

  setMaxTokens(tokens) {
    this.maxTokens = tokens
    logger.info('ChatGPT max tokens updated', { tokens })
  }

  setCooldown(seconds) {
    this.cooldownDuration = seconds * 1000
    logger.info('ChatGPT cooldown updated', { seconds })
  }

  // Get service stats
  getStats() {
    return {
      configured: this.isConfigured(),
      model: this.model,
      maxTokens: this.maxTokens,
      cooldown: this.cooldownDuration / 1000,
      activeUsers: this.userContexts.size,
      usersOnCooldown: Array.from(this.userCooldowns.entries())
        .filter(([_, lastUse]) => Date.now() - lastUse < this.cooldownDuration)
        .length
    }
  }
}

export default ChatGPTService