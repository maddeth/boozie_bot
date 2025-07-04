/**
 * Moderator Sync Service
 * Syncs Twitch moderator status with the local database
 */

import logger from '../utils/logger.js'
import { 
  getOrCreateUser, 
  updateModeratorStatus, 
  updateSubscriptionStatus,
  getModerators 
} from './userService.js'

/**
 * Sync moderators from Twitch API to database
 * @param {Object} twitchService - TwitchService instance
 * @param {string} channelId - Channel ID to check moderators for
 * @returns {Object} - Sync results
 */
export const syncModerators = async (twitchService, channelId) => {
  try {
    logger.info('Starting moderator sync', { channelId })
    
    // Get current moderators from Twitch API
    const twitchModerators = await getTwitchModerators(twitchService, channelId)
    
    if (!twitchModerators) {
      logger.warn('Failed to fetch moderators from Twitch API')
      return { success: false, error: 'Failed to fetch from Twitch API' }
    }
    
    // Ensure broadcaster (channel owner) is always treated as a moderator
    // Add broadcaster to the list if not already there
    const broadcasterInfo = {
      id: channelId,
      login: 'maddeth', // Your username
      display_name: 'Maddeth'
    }
    
    // Check if broadcaster is already in the moderators list
    const broadcasterInList = twitchModerators.some(mod => mod.id === channelId)
    if (!broadcasterInList) {
      twitchModerators.push(broadcasterInfo)
      logger.info('Added broadcaster to moderators list', { broadcaster: broadcasterInfo.login })
    }
    
    // Get current moderators from database
    const dbModerators = await getModerators()
    const dbModeratorIds = new Set(dbModerators.map(mod => mod.twitch_user_id))
    const twitchModeratorIds = new Set(twitchModerators.map(mod => mod.id))
    
    let addedCount = 0
    let removedCount = 0
    let updatedCount = 0
    
    // Add new moderators and update existing ones
    for (const twitchMod of twitchModerators) {
      try {
        // Ensure user exists in database and update display name
        await getOrCreateUser(twitchMod.id, twitchMod.login, twitchMod.display_name)
        
        if (!dbModeratorIds.has(twitchMod.id)) {
          // New moderator - add them
          const success = await updateModeratorStatus(twitchMod.id, true)
          if (success) {
            addedCount++
            logger.info('Added new moderator', { 
              username: twitchMod.login,
              displayName: twitchMod.display_name,
              twitchUserId: twitchMod.id
            })
          }
        } else {
          // Existing moderator - their display name was updated via getOrCreateUser
          updatedCount++
        }
      } catch (error) {
        logger.error('Error processing moderator', { 
          moderator: twitchMod,
          error: error.message 
        })
      }
    }
    
    // Remove users who are no longer moderators (except broadcaster)
    for (const dbMod of dbModerators) {
      if (!twitchModeratorIds.has(dbMod.twitch_user_id)) {
        // Never remove broadcaster/channel owner from moderators
        if (dbMod.twitch_user_id === channelId) {
          logger.debug('Skipping broadcaster removal from moderators', { 
            username: dbMod.username,
            twitchUserId: dbMod.twitch_user_id
          })
          continue
        }
        
        try {
          const success = await updateModeratorStatus(dbMod.twitch_user_id, false)
          if (success) {
            removedCount++
            logger.info('Removed moderator status', { 
              username: dbMod.username,
              twitchUserId: dbMod.twitch_user_id
            })
          }
        } catch (error) {
          logger.error('Error removing moderator status', { 
            moderator: dbMod,
            error: error.message 
          })
        }
      }
    }
    
    const results = {
      success: true,
      totalTwitchMods: twitchModerators.length,
      totalDbMods: dbModerators.length,
      added: addedCount,
      removed: removedCount,
      updated: updatedCount
    }
    
    logger.info('Moderator sync completed', results)
    return results
    
  } catch (error) {
    logger.error('Moderator sync failed', { 
      channelId, 
      error: error.message 
    })
    return { success: false, error: error.message }
  }
}

/**
 * Get moderators from Twitch API
 * @param {Object} twitchService - TwitchService instance  
 * @param {string} channelId - Channel ID
 * @returns {Array|null} - Array of moderator objects or null if failed
 */
async function getTwitchModerators(twitchService, channelId) {
  try {
    // Use the existing Twitch API client from twitchService
    const apiClient = twitchService.getApiClient()
    
    if (!apiClient) {
      logger.error('No API client available from TwitchService')
      return null
    }
    
    // Get moderators using Twurple API with channel owner context
    const moderators = await apiClient.asUser(channelId, async ctx => {
      return await ctx.moderation.getModerators(channelId)
    })
    
    // Convert to simple objects
    const moderatorData = moderators.data.map(mod => ({
      id: mod.userId,
      login: mod.userName,
      display_name: mod.userDisplayName
    }))
    
    logger.debug('Fetched moderators from Twitch', { 
      count: moderatorData.length,
      moderators: moderatorData.map(m => m.login)
    })
    
    return moderatorData
    
  } catch (error) {
    logger.error('Failed to fetch moderators from Twitch API', { 
      channelId,
      error: error.message 
    })
    return null
  }
}

/**
 * Sync a single user's moderator status
 * @param {Object} twitchService - TwitchService instance
 * @param {string} channelId - Channel ID
 * @param {string} username - Username to check
 * @returns {Object} - Sync result
 */
export const syncSingleModerator = async (twitchService, channelId, username) => {
  try {
    logger.debug('Syncing single moderator', { username, channelId })
    
    // Get user info from Twitch
    const apiClient = twitchService.getApiClient()
    if (!apiClient) {
      return { success: false, error: 'No API client available' }
    }
    
    const user = await apiClient.users.getUserByName(username)
    if (!user) {
      return { success: false, error: 'User not found on Twitch' }
    }
    
    // Check if they're a moderator using channel owner context
    const moderators = await apiClient.asUser(channelId, async ctx => {
      return await ctx.moderation.getModerators(channelId)
    })
    const isMod = moderators.data.some(mod => mod.userId === user.id)
    
    // Ensure user exists in database
    await getOrCreateUser(user.id, user.name, user.displayName)
    
    // Update moderator status
    const success = await updateModeratorStatus(user.id, isMod)
    
    if (success) {
      logger.info('Single moderator sync completed', { 
        username,
        isModerator: isMod,
        twitchUserId: user.id
      })
      return { 
        success: true, 
        username,
        isModerator: isMod,
        twitchUserId: user.id
      }
    } else {
      return { success: false, error: 'Failed to update database' }
    }
    
  } catch (error) {
    logger.error('Single moderator sync failed', { 
      username,
      channelId,
      error: error.message 
    })
    return { success: false, error: error.message }
  }
}

/**
 * Sync subscription status for current chatters
 * @param {Object} twitchService - TwitchService instance
 * @param {Function} subLookup - Subscription lookup function
 * @returns {Object} - Sync results
 */
export const syncSubscribers = async (twitchService, subLookup) => {
  try {
    logger.info('Starting subscriber sync')
    
    const chatters = twitchService.getChatters()
    let syncedCount = 0
    let errorCount = 0
    
    for (const [displayName, userId] of chatters) {
      try {
        // Ensure user exists in database
        await getOrCreateUser(userId, displayName.toLowerCase(), displayName)
        
        // Check subscription status
        const tier = await subLookup(displayName, userId)
        const isSubscriber = tier !== "0"
        
        // Update subscription status in database
        const success = await updateSubscriptionStatus(userId, isSubscriber, tier)
        if (success) {
          syncedCount++
        } else {
          errorCount++
        }
        
      } catch (error) {
        logger.warn('Error syncing subscriber', { 
          displayName,
          userId,
          error: error.message 
        })
        errorCount++
      }
    }
    
    const results = {
      success: true,
      totalChatters: chatters.size,
      synced: syncedCount,
      errors: errorCount
    }
    
    logger.info('Subscriber sync completed', results)
    return results
    
  } catch (error) {
    logger.error('Subscriber sync failed', { error: error.message })
    return { success: false, error: error.message }
  }
}

export default {
  syncModerators,
  syncSingleModerator,
  syncSubscribers
}