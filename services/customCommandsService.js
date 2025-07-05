/**
 * Custom Commands Service
 * Handles execution and management of custom bot commands
 */

import sql from './database/db.js'
import logger from '../utils/logger.js'
import { getUserEggs, updateUserEggs } from './eggServicePostgres.js'

class CustomCommandsService {
  constructor(websocketService = null) {
    this.commands = new Map()
    this.exactCommands = new Map()
    this.containsCommands = []
    this.regexCommands = []
    this.cooldowns = new Map()
    this.lastLoad = 0
    this.cacheTimeout = 60000 // Cache for 1 minute
    this.websocketService = websocketService
    
    // Load commands on initialization
    this.loadCommands()
    
    logger.info('CustomCommandsService initialized')
  }
  
  setWebSocketService(websocketService) {
    this.websocketService = websocketService
  }

  /**
   * Load all commands from database into memory cache
   */
  async loadCommands() {
    try {
      logger.info('Loading custom commands from database...')
      const commands = await sql(`
        SELECT id, trigger, response, cooldown, permission, enabled, usage_count, 
               COALESCE(trigger_type, 'exact') as trigger_type, audio_url,
               COALESCE(egg_cost, 0) as egg_cost
        FROM custom_commands
        WHERE enabled = true
        ORDER BY trigger ASC
      `)
      
      // Clear and rebuild cache
      this.commands.clear()
      this.exactCommands = new Map()
      this.containsCommands = []
      this.regexCommands = []
      
      commands.forEach(cmd => {
        const key = cmd.trigger.toLowerCase()
        this.commands.set(key, cmd)
        
        // Organize by trigger type for efficient matching
        switch (cmd.trigger_type) {
          case 'exact':
            this.exactCommands.set(key, cmd)
            break
          case 'contains':
            this.containsCommands.push({ pattern: key, command: cmd })
            break
          case 'regex':
            try {
              const regex = new RegExp(cmd.trigger, 'i')
              this.regexCommands.push({ regex, command: cmd })
            } catch (error) {
              logger.error('Invalid regex pattern', { trigger: cmd.trigger, error: error.message })
            }
            break
        }
      })
      
      this.lastLoad = Date.now()
      
      logger.info('Custom commands loaded', { 
        count: commands.length,
        exact: this.exactCommands.size,
        contains: this.containsCommands.length,
        regex: this.regexCommands.length
      })
      
    } catch (error) {
      logger.error('Failed to load custom commands', { error: error.message })
    }
  }

  /**
   * Check if cache needs refreshing
   */
  shouldRefreshCache() {
    return Date.now() - this.lastLoad > this.cacheTimeout
  }

  /**
   * Get a command by trigger
   */
  async getCommand(trigger) {
    // Refresh cache if needed
    if (this.shouldRefreshCache()) {
      await this.loadCommands()
    }
    
    return this.commands.get(trigger.toLowerCase())
  }

  /**
   * Check if user has permission to use command
   */
  hasPermission(command, userInfo) {
    switch (command.permission) {
      case 'everyone':
        return true
      case 'subscriber':
        return userInfo.isSubscriber || userInfo.isModerator || userInfo.isVip
      case 'vip':
        return userInfo.isVip || userInfo.isModerator
      case 'moderator':
        return userInfo.isModerator
      default:
        return false
    }
  }

  /**
   * Check if command is on cooldown for user
   */
  isOnCooldown(commandId, username) {
    const cooldownKey = `${commandId}_${username}`
    const lastUsed = this.cooldowns.get(cooldownKey)
    
    if (!lastUsed) return false
    
    const command = Array.from(this.commands.values()).find(cmd => cmd.id === commandId)
    if (!command || command.cooldown === 0) return false
    
    const timeSinceLastUse = Date.now() - lastUsed
    return timeSinceLastUse < (command.cooldown * 1000)
  }

  /**
   * Set cooldown for user and command
   */
  setCooldown(commandId, username) {
    const cooldownKey = `${commandId}_${username}`
    this.cooldowns.set(cooldownKey, Date.now())
    
    // Clean up old cooldowns periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      this.cleanupCooldowns()
    }
  }

  /**
   * Clean up expired cooldowns
   */
  cleanupCooldowns() {
    const now = Date.now()
    const maxCooldown = 300000 // 5 minutes max cooldown
    
    for (const [key, timestamp] of this.cooldowns.entries()) {
      if (now - timestamp > maxCooldown) {
        this.cooldowns.delete(key)
      }
    }
  }

  /**
   * Process command response, replacing placeholders
   */
  processResponse(response, username, userInfo = {}) {
    return response
      .replace(/\{user\}/g, username)
      .replace(/\{username\}/g, username)
      .replace(/\{displayname\}/g, userInfo.displayName || username)
      .replace(/\{channel\}/g, userInfo.channel || '')
  }

  /**
   * Execute a custom command
   */
  async executeCommand(trigger, username, userInfo = {}, sendMessage) {
    try {
      logger.debug('Executing command', { trigger, username })
      const command = await this.getCommand(trigger)
      
      if (!command) {
        logger.debug('Command not found', { trigger })
        return false // Command not found
      }
      
      logger.debug('Command found', { trigger, commandId: command.id })

      // Check permissions
      if (!this.hasPermission(command, userInfo)) {
        logger.debug('Command permission denied', { 
          trigger, 
          username, 
          permission: command.permission,
          userInfo 
        })
        return false
      }

      // Check cooldown
      if (this.isOnCooldown(command.id, username)) {
        logger.debug('Command on cooldown', { trigger, username, commandId: command.id })
        return false
      }

      // Check egg cost
      if (command.egg_cost > 0) {
        const userEggs = await getUserEggs(userInfo.twitchUserId || username)
        
        if (!userEggs || userEggs.eggsAmount < command.egg_cost) {
          logger.debug('User has insufficient eggs for command', { 
            trigger, 
            username, 
            required: command.egg_cost,
            available: userEggs ? userEggs.eggsAmount : 0
          })
          return false
        }

        // Deduct egg cost
        const deductResult = await updateUserEggs(
          userInfo.twitchUserId || username, 
          username, 
          -command.egg_cost
        )
        
        if (!deductResult || deductResult.error) {
          logger.error('Failed to deduct eggs for command', { 
            trigger, 
            username, 
            eggCost: command.egg_cost,
            error: deductResult?.error
          })
          return false
        }

        logger.info('Eggs deducted for command', { 
          trigger, 
          username, 
          eggCost: command.egg_cost,
          remainingEggs: deductResult.eggsAmount
        })
      }

      let responseText = null
      
      // Process and send text response if present
      logger.debug('Command details', { 
        trigger, 
        hasResponse: !!command.response, 
        hasAudioUrl: !!command.audio_url,
        response: command.response 
      })
      
      if (command.response) {
        responseText = this.processResponse(command.response, username, userInfo)
        sendMessage(responseText)
      }
      
      // Play audio if present
      if (command.audio_url && this.websocketService) {
        this.websocketService.broadcast({
          type: 'redeem',
          id: command.audio_url
        })
        logger.debug('Sent audio command to WebSocket', { 
          trigger, 
          audioUrl: command.audio_url 
        })
      }

      // Set cooldown
      this.setCooldown(command.id, username)

      // Update usage count in database (fire and forget)
      this.updateUsageCount(command.id).catch(error => {
        logger.error('Failed to update command usage count', { 
          commandId: command.id, 
          error: error.message 
        })
      })

      try {
        logger.info('Custom command executed', { 
          trigger, 
          username, 
          commandId: command.id,
          response: responseText ? responseText.substring(0, 100) : '(audio only)',
          hasAudio: !!command.audio_url
        })
      } catch (logError) {
        logger.error('Error in command execution logging', { 
          trigger, 
          username, 
          logError: logError.message,
          responseText: typeof responseText,
          responseTextValue: responseText
        })
      }

      return true

    } catch (error) {
      logger.error('Error executing custom command', { 
        trigger, 
        username, 
        error: error.message 
      })
      return false
    }
  }

  /**
   * Update command usage count in database
   */
  async updateUsageCount(commandId) {
    try {
      await sql(`
        UPDATE custom_commands
        SET usage_count = usage_count + 1,
            last_used_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [commandId])
      
    } catch (error) {
      logger.error('Failed to update command usage count', { 
        commandId, 
        error: error.message 
      })
    }
  }

  /**
   * Check if a message starts with any command trigger
   */
  async findMatchingCommand(message) {
    // Refresh cache if needed
    if (this.shouldRefreshCache()) {
      await this.loadCommands()
    }

    const messageLower = message.toLowerCase()
    
    // 1. Check exact matches first (highest priority)
    for (const [trigger, command] of this.exactCommands.entries()) {
      if (messageLower.startsWith(trigger) && 
          (messageLower.length === trigger.length || 
           messageLower[trigger.length] === ' ')) {
        return { trigger, command }
      }
    }
    
    // 2. Check contains patterns
    for (const { pattern, command } of this.containsCommands) {
      if (messageLower.includes(pattern)) {
        return { trigger: command.trigger, command }
      }
    }
    
    // 3. Check regex patterns (lowest priority)
    for (const { regex, command } of this.regexCommands) {
      if (regex.test(message)) {
        return { trigger: command.trigger, command }
      }
    }
    
    return null
  }

  /**
   * Get all commands (for debugging)
   */
  getAllCommands() {
    return Array.from(this.commands.values())
  }

  /**
   * Force reload commands from database
   */
  async reloadCommands() {
    await this.loadCommands()
    logger.info('Custom commands manually reloaded')
  }
}

export default CustomCommandsService