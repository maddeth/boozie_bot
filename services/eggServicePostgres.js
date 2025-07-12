/**
 * PostgreSQL-based Eggs Service
 * Manages user eggs using PostgreSQL database linked to Twitch IDs
 */

import sql from './database/db.js'
import logger from '../utils/logger.js'
import dotenv from 'dotenv'

// Load environment variables


/**
 * Get user's egg count by Twitch user ID or username
 * @param {string} identifier - Twitch user ID or username
 * @returns {Object|null} - User egg data or null if not found
 */
export const getUserEggs = async (identifier) => {
  try {
    // Try to find by Twitch user ID first (preferred method)
    let result = await sql(
      'SELECT * FROM eggs WHERE twitch_user_id = $1',
      [identifier]
    )

    // If not found by ID, try by username (fallback for legacy data)
    if (result.length === 0) {
      result = await sql(
        'SELECT * FROM eggs WHERE LOWER(username_sanitised) = LOWER($1)',
        [identifier]
      )
    }

    if (result.length > 0) {
      logger.debug('Retrieved user eggs', {
        identifier,
        eggs: result[0].eggs_amount,
        twitchUserId: result[0].twitch_user_id
      })
      return {
        id: result[0].id,
        username: result[0].username,
        usernameSanitised: result[0].username_sanitised,
        twitchUserId: result[0].twitch_user_id,
        eggsAmount: result[0].eggs_amount,
        createdAt: result[0].created_at,
        updatedAt: result[0].updated_at
      }
    }

    return null

  } catch (error) {
    logger.error('Failed to get user eggs', { identifier, error: error.message })
    return null
  }
}

/**
 * Create or update user eggs entry
 * @param {string} twitchUserId - Twitch user ID
 * @param {string} username - Username
 * @param {number} eggAmount - Initial egg amount
 * @returns {Object|null} - Created/updated egg data or null if failed
 */
export const createOrUpdateUserEggs = async (twitchUserId, username, eggAmount = 0) => {
  try {
    const usernameSanitised = username.toLowerCase()

    // Check if user already exists (by Twitch ID or username)
    const existingUser = await getUserEggs(twitchUserId)

    if (existingUser) {
      // Update existing user with current username (in case they changed it)
      const result = await sql(
        `UPDATE eggs 
         SET username = $1, username_sanitised = $2, updated_at = CURRENT_TIMESTAMP
         WHERE twitch_user_id = $3 
         RETURNING *`,
        [username, usernameSanitised, twitchUserId]
      )

      logger.info('Updated existing egg user with current username', {
        twitchUserId,
        username,
        previousUsername: existingUser.username,
        eggs: result[0].eggs_amount
      })

      return result[0]
    }

    // Create new user
    const result = await sql(
      `INSERT INTO eggs (twitch_user_id, username, username_sanitised, eggs_amount) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [twitchUserId, username, usernameSanitised, eggAmount]
    )

    logger.info('Created new egg user', {
      twitchUserId,
      username,
      initialEggs: eggAmount
    })

    return result[0]

  } catch (error) {
    logger.error('Failed to create or update user eggs', {
      twitchUserId,
      username,
      eggAmount,
      error: error.message
    })
    return null
  }
}

/**
 * Update user's egg amount
 * @param {string} twitchUserId - Twitch user ID
 * @param {string} username - Username (for fallback lookup)
 * @param {number} eggChange - Amount to add/subtract
 * @returns {Object|null} - Updated egg data or null if failed
 */
export const updateUserEggs = async (twitchUserId, username, eggChange) => {
  try {
    // Get current egg data
    const currentData = await getUserEggs(twitchUserId) || await getUserEggs(username)

    if (!currentData) {
      // User doesn't exist, create them with the egg change amount (if positive)
      if (eggChange > 0) {
        return await createOrUpdateUserEggs(twitchUserId, username, eggChange)
      } else {
        logger.warn('Cannot subtract eggs from non-existent user', { twitchUserId, username, eggChange })
        return null
      }
    }

    const newAmount = currentData.eggsAmount + eggChange

    // Prevent negative eggs
    if (newAmount < 0) {
      logger.warn('Insufficient eggs for transaction', {
        twitchUserId,
        username,
        currentEggs: currentData.eggsAmount,
        requestedChange: eggChange
      })
      return { error: 'insufficient_eggs', currentEggs: currentData.eggsAmount }
    }

    // Update eggs amount
    const result = await sql(
      `UPDATE eggs 
       SET eggs_amount = $1, username = $2, username_sanitised = $3, updated_at = CURRENT_TIMESTAMP
       WHERE twitch_user_id = $4 OR id = $5
       RETURNING *`,
      [newAmount, username, username.toLowerCase(), twitchUserId, currentData.id]
    )

    if (result.length > 0) {
      logger.info('Updated user eggs', {
        twitchUserId,
        username,
        previousAmount: currentData.eggsAmount,
        change: eggChange,
        newAmount: newAmount
      })

      return result[0]
    }

    return null

  } catch (error) {
    logger.error('Failed to update user eggs', {
      twitchUserId,
      username,
      eggChange,
      error: error.message
    })
    return null
  }
}

/**
 * Get all users with their egg counts
 * @param {number} limit - Maximum number of users to return
 * @param {string} orderBy - Order by 'eggs' or 'username' (default: 'eggs')
 * @returns {Array} - Array of user egg data
 */
export const getAllUserEggs = async (limit = 100, orderBy = 'eggs') => {
  try {
    const orderColumn = orderBy === 'username' ? 'username' : 'eggs_amount DESC'

    const result = await sql(
      `SELECT * FROM eggs 
       ORDER BY ${orderColumn === 'username' ? 'username ASC' : 'eggs_amount DESC'} 
       LIMIT $1`,
      [limit]
    )

    logger.debug('Retrieved all user eggs', { count: result.length, orderBy })
    return result

  } catch (error) {
    logger.error('Failed to get all user eggs', { error: error.message })
    return []
  }
}

/**
 * Get egg leaderboard
 * @param {number} limit - Number of top users to return
 * @returns {Array} - Top users by egg count
 */
export const getEggLeaderboard = async (limit = 10) => {
  try {
    const result = await sql(
      `SELECT username, eggs_amount, twitch_user_id, updated_at
       FROM eggs 
       WHERE eggs_amount > 0
       ORDER BY eggs_amount DESC 
       LIMIT $1`,
      [limit]
    )

    logger.debug('Retrieved egg leaderboard', { count: result.length, limit })
    return result

  } catch (error) {
    logger.error('Failed to get egg leaderboard', { error: error.message })
    return []
  }
}

/**
 * Get total eggs statistics
 * @returns {Object} - Statistics about eggs
 */
export const getEggStats = async () => {
  try {
    const stats = await sql(`
      SELECT 
        COUNT(*) as total_users,
        SUM(eggs_amount) as total_eggs,
        AVG(eggs_amount) as average_eggs,
        MAX(eggs_amount) as max_eggs
      FROM eggs
    `)

    const result = {
      totalUsers: parseInt(stats[0].total_users, 10),
      totalEggs: parseInt(stats[0].total_eggs, 10) || 0,
      averageEggs: parseFloat(stats[0].average_eggs) || 0,
      maxEggs: parseInt(stats[0].max_eggs, 10) || 0
    }

    logger.debug('Retrieved egg statistics', result)
    return result

  } catch (error) {
    logger.error('Failed to get egg statistics', { error: error.message })
    return {
      totalUsers: 0,
      totalEggs: 0,
      averageEggs: 0,
      maxEggs: 0
    }
  }
}

/**
 * Legacy command wrapper for compatibility
 * @param {string} userToUpdate - Username to update
 * @param {number} eggsToAdd - Eggs to add/subtract
 * @param {boolean} printToChat - Whether to print result to chat
 * @param {Function} sendChatMessage - Chat message function
 * @param {string} twitchUserId - Twitch user ID (preferred identifier)
 */
export const eggUpdateCommand = async (userToUpdate, eggsToAdd, printToChat, sendChatMessage = null, twitchUserId = null) => {
  const result = await updateUserEggs(twitchUserId || userToUpdate, userToUpdate, eggsToAdd)

  if (!result) {
    if (sendChatMessage) {
      sendChatMessage(`Failed to update eggs for ${userToUpdate}`)
    }
    return
  }

  if (result.error === 'insufficient_eggs') {
    if (sendChatMessage) {
      sendChatMessage("You don't have enough eggs")
    }
    return
  }

  if (printToChat && sendChatMessage) {
    const newAmount = result.eggs_amount

    if (eggsToAdd === 1) {
      sendChatMessage(`Added ${eggsToAdd} egg, ${userToUpdate} now has ${newAmount} eggs`)
    } else if (eggsToAdd > 1) {
      sendChatMessage(`Added ${eggsToAdd} eggs, ${userToUpdate} now has ${newAmount} eggs`)
    } else if (eggsToAdd === -1) {
      sendChatMessage(`Removed ${Math.abs(eggsToAdd)} egg, ${userToUpdate} now has ${newAmount} eggs`)
    } else if (eggsToAdd < 0) {
      sendChatMessage(`Removed ${Math.abs(eggsToAdd)} eggs, ${userToUpdate} now has ${newAmount} eggs`)
    } else if (eggsToAdd === 0) {
      sendChatMessage(`${userToUpdate} has ${newAmount} eggs`)
    }
  }
}

export default {
  getUserEggs,
  createOrUpdateUserEggs,
  updateUserEggs,
  getAllUserEggs,
  getEggLeaderboard,
  getEggStats,
  eggUpdateCommand
}