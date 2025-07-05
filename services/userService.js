/**
 * User Service
 * Manages user data, roles, and privileges across Twitch and Supabase
 */

import sql from './database/db.js'
import logger from '../utils/logger.js'
import dotenv from 'dotenv'

// Load environment variables


/**
 * Get or create a user in the database
 * @param {string} twitchUserId - Twitch user ID
 * @param {string} username - Twitch username
 * @param {string} displayName - Twitch display name
 * @returns {Object|null} - User data or null if failed
 */
export const getOrCreateUser = async (twitchUserId, username, displayName = null) => {
  try {
    // First try to get existing user by Twitch ID
    let user = await sql(
      'SELECT * FROM users WHERE twitch_user_id = $1',
      [twitchUserId]
    )
    
    if (user.length > 0) {
      // Always update display name, username, and last seen to keep current
      const currentDisplayName = displayName || username
      const shouldUpdate = user[0].username !== username || 
                          user[0].display_name !== currentDisplayName ||
                          !user[0].last_seen ||
                          (new Date() - new Date(user[0].last_seen)) > 60000 // Update if last seen > 1 minute ago

      if (shouldUpdate) {
        await sql(
          'UPDATE users SET username = $1, display_name = $2, last_seen = CURRENT_TIMESTAMP WHERE twitch_user_id = $3',
          [username, currentDisplayName, twitchUserId]
        )
        
        logger.debug('Updated existing user with current info', { 
          twitchUserId, 
          username, 
          displayName: currentDisplayName,
          previousDisplayName: user[0].display_name
        })
      }
      
      return user[0]
    }
    
    // If no user found by Twitch ID, check if there's an existing user by username
    // This handles cases where we might have placeholder/temp entries
    const existingByUsername = await sql(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    )
    
    if (existingByUsername.length > 0) {
      // Update the existing entry with the real Twitch ID and current display name
      const currentDisplayName = displayName || username
      const updatedUser = await sql(
        `UPDATE users 
         SET twitch_user_id = $1, display_name = $2, username = $3, last_seen = CURRENT_TIMESTAMP 
         WHERE id = $4 
         RETURNING *`,
        [twitchUserId, currentDisplayName, username, existingByUsername[0].id]
      )
      
      logger.info('Updated existing user with real Twitch ID and current display name', { 
        oldTwitchId: existingByUsername[0].twitch_user_id,
        newTwitchId: twitchUserId,
        username, 
        displayName: currentDisplayName,
        previousDisplayName: existingByUsername[0].display_name
      })
      
      return updatedUser[0]
    }
    
    // Create new user with current display name
    const currentDisplayName = displayName || username
    const newUser = await sql(
      `INSERT INTO users (twitch_user_id, username, display_name, last_seen) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
       RETURNING *`,
      [twitchUserId, username, currentDisplayName]
    )
    
    logger.info('Created new user', { 
      twitchUserId, 
      username, 
      displayName: currentDisplayName 
    })
    
    return newUser[0]
    
  } catch (error) {
    logger.error('Failed to get or create user', { 
      twitchUserId, 
      username, 
      error: error.message 
    })
    return null
  }
}

/**
 * Update user's moderator status
 * @param {string} twitchUserId - Twitch user ID
 * @param {boolean} isModerator - New moderator status
 * @returns {boolean} - Success status
 */
export const updateModeratorStatus = async (twitchUserId, isModerator) => {
  try {
    const updateData = {
      is_moderator: isModerator,
      moderator_updated: new Date().toISOString()
    }
    
    // If becoming a moderator for the first time, set moderator_since
    if (isModerator) {
      const existingUser = await sql(
        'SELECT moderator_since FROM users WHERE twitch_user_id = $1',
        [twitchUserId]
      )
      
      if (existingUser.length > 0 && !existingUser[0].moderator_since) {
        updateData.moderator_since = new Date().toISOString()
      }
    }
    
    const result = await sql(
      `UPDATE users 
       SET is_moderator = $1, 
           moderator_updated = $2,
           moderator_since = CASE 
             WHEN $1 = true AND moderator_since IS NULL THEN $2
             ELSE moderator_since
           END
       WHERE twitch_user_id = $3
       RETURNING *`,
      [isModerator, updateData.moderator_updated, twitchUserId]
    )
    
    if (result.length > 0) {
      logger.info('Updated moderator status', { 
        twitchUserId, 
        isModerator,
        moderatorSince: result[0].moderator_since
      })
      return true
    } else {
      logger.warn('User not found when updating moderator status', { twitchUserId })
      return false
    }
    
  } catch (error) {
    logger.error('Failed to update moderator status', { 
      twitchUserId, 
      isModerator, 
      error: error.message 
    })
    return false
  }
}

/**
 * Update user's subscription status
 * @param {string} twitchUserId - Twitch user ID
 * @param {boolean} isSubscriber - Subscription status
 * @param {string} tier - Subscription tier ('0', '1000', '2000', '3000')
 * @returns {boolean} - Success status
 */
export const updateSubscriptionStatus = async (twitchUserId, isSubscriber, tier = '0') => {
  try {
    const result = await sql(
      `UPDATE users 
       SET is_subscriber = $1, 
           subscription_tier = $2,
           subscription_updated = CURRENT_TIMESTAMP
       WHERE twitch_user_id = $3
       RETURNING *`,
      [isSubscriber, tier, twitchUserId]
    )
    
    if (result.length > 0) {
      logger.debug('Updated subscription status', { 
        twitchUserId, 
        isSubscriber, 
        tier 
      })
      return true
    } else {
      logger.warn('User not found when updating subscription status', { twitchUserId })
      return false
    }
    
  } catch (error) {
    logger.error('Failed to update subscription status', { 
      twitchUserId, 
      isSubscriber, 
      tier, 
      error: error.message 
    })
    return false
  }
}

/**
 * Link a Supabase user ID to a Twitch user
 * @param {string} twitchUserId - Twitch user ID
 * @param {string} supabaseUserId - Supabase user UUID
 * @param {string} email - User email from Supabase
 * @returns {boolean} - Success status
 */
export const linkSupabaseUser = async (twitchUserId, supabaseUserId, email = null) => {
  try {
    const result = await sql(
      `UPDATE users 
       SET supabase_user_id = $1, 
           email = $2
       WHERE twitch_user_id = $3
       RETURNING *`,
      [supabaseUserId, email, twitchUserId]
    )
    
    if (result.length > 0) {
      logger.info('Linked Supabase user to Twitch user', { 
        twitchUserId, 
        supabaseUserId, 
        email 
      })
      return true
    } else {
      logger.warn('Twitch user not found when linking Supabase user', { twitchUserId })
      return false
    }
    
  } catch (error) {
    logger.error('Failed to link Supabase user', { 
      twitchUserId, 
      supabaseUserId, 
      error: error.message 
    })
    return false
  }
}

/**
 * Get user by Twitch user ID
 * @param {string} twitchUserId - Twitch user ID
 * @returns {Object|null} - User data or null if not found
 */
export const getUserByTwitchId = async (twitchUserId) => {
  try {
    const result = await sql(
      'SELECT * FROM users WHERE twitch_user_id = $1',
      [twitchUserId]
    )
    
    return result.length > 0 ? result[0] : null
    
  } catch (error) {
    logger.error('Failed to get user by Twitch ID', { 
      twitchUserId, 
      error: error.message 
    })
    return null
  }
}

/**
 * Get user by Supabase user ID
 * @param {string} supabaseUserId - Supabase user UUID
 * @returns {Object|null} - User data or null if not found
 */
export const getUserBySupabaseId = async (supabaseUserId) => {
  try {
    console.log('🔍 getUserBySupabaseId called with:', typeof supabaseUserId, JSON.stringify(supabaseUserId))
    const result = await sql(
      'SELECT * FROM users WHERE supabase_user_id = $1',
      [supabaseUserId]
    )
    
    return result.length > 0 ? result[0] : null
    
  } catch (error) {
    logger.error('Failed to get user by Supabase ID', { 
      supabaseUserId, 
      error: error.message 
    })
    return null
  }
}

/**
 * Get user by username
 * @param {string} username - Twitch username
 * @returns {Object|null} - User data or null if not found
 */
export const getUserByUsername = async (username) => {
  try {
    const result = await sql(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    )
    
    return result.length > 0 ? result[0] : null
    
  } catch (error) {
    logger.error('Failed to get user by username', { 
      username, 
      error: error.message 
    })
    return null
  }
}

/**
 * Get all moderators
 * @returns {Array} - List of moderator users
 */
export const getModerators = async () => {
  try {
    const result = await sql(
      'SELECT * FROM users WHERE is_moderator = true ORDER BY moderator_since ASC'
    )
    
    logger.debug('Retrieved moderators list', { count: result.length })
    return result
    
  } catch (error) {
    logger.error('Failed to get moderators', { error: error.message })
    return []
  }
}

/**
 * Check if user is a moderator
 * @param {string} twitchUserId - Twitch user ID
 * @returns {boolean} - Moderator status
 */
export const isModerator = async (twitchUserId) => {
  try {
    const result = await sql(
      'SELECT is_moderator FROM users WHERE twitch_user_id = $1',
      [twitchUserId]
    )
    
    return result.length > 0 ? result[0].is_moderator : false
    
  } catch (error) {
    logger.error('Failed to check moderator status', { 
      twitchUserId, 
      error: error.message 
    })
    return false
  }
}

/**
 * Get user statistics
 * @returns {Object} - User statistics
 */
export const getUserStats = async () => {
  try {
    const stats = await sql(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_moderator = true THEN 1 END) as moderators,
        COUNT(CASE WHEN is_subscriber = true THEN 1 END) as subscribers,
        COUNT(CASE WHEN supabase_user_id IS NOT NULL THEN 1 END) as registered_users,
        COUNT(CASE WHEN last_seen > CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 END) as active_weekly
      FROM users
    `)
    
    const result = {
      totalUsers: parseInt(stats[0].total_users, 10),
      moderators: parseInt(stats[0].moderators, 10),
      subscribers: parseInt(stats[0].subscribers, 10),
      registeredUsers: parseInt(stats[0].registered_users, 10),
      activeWeekly: parseInt(stats[0].active_weekly, 10)
    }
    
    logger.debug('Retrieved user statistics', result)
    return result
    
  } catch (error) {
    logger.error('Failed to get user statistics', { error: error.message })
    return {
      totalUsers: 0,
      moderators: 0,
      subscribers: 0,
      registeredUsers: 0,
      activeWeekly: 0
    }
  }
}