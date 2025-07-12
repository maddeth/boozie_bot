/**
 * PostgreSQL Egg Service
 * Handles all egg-related database operations using PostgreSQL
 * Replaces the Azure Table Storage implementation
 */

import sql from './database/db.js'
import logger from '../utils/logger.js'
import dotenv from 'dotenv'

// Load environment variables from .env file in parent directory


/**
 * Get a user's egg count from PostgreSQL
 * @param {string} username - The username to look up
 * @returns {Object|null} - User egg data or null if not found
 */
export const getUserEggs = async (username) => {
  try {
    const response = await sql(
      'SELECT id, username, eggs_amount, twitch_user_id, created_at, updated_at FROM eggs WHERE username_sanitised = $1',
      [username.toLowerCase()]
    )

    if (response.length > 0) {
      logger.debug('Retrieved user eggs from PostgreSQL', {
        username,
        eggs: response[0].eggs_amount
      })
      return response[0]
    }

    logger.debug('User not found in eggs table', { username })
    return null

  } catch (error) {
    logger.error('Failed to get user eggs from PostgreSQL', {
      username,
      error: error.message
    })
    return null
  }
}

/**
 * Add a new user to the eggs table
 * @param {string} username - The username
 * @param {number} eggAmount - Initial egg amount
 * @param {string} twitchUserId - Optional Twitch user ID
 * @returns {Object|null} - Created user data or null if failed
 */
export const addEggUser = async (username, eggAmount = 0, twitchUserId = null) => {
  try {
    const response = await sql(
      'INSERT INTO eggs (username, username_sanitised, eggs_amount, twitch_user_id) VALUES ($1, $2, $3, $4) RETURNING id, username, eggs_amount, twitch_user_id',
      [username, username.toLowerCase(), eggAmount, twitchUserId]
    )

    logger.info('Created new egg user in PostgreSQL', {
      username,
      initialEggs: eggAmount,
      userId: response[0].id
    })

    return response[0]

  } catch (error) {
    if (error.message.includes("duplicate key value violates unique constraint")) {
      logger.warn('Attempted to add existing egg user', { username })
      return await getUserEggs(username) // Return existing user
    }

    logger.error('Failed to add egg user to PostgreSQL', {
      username,
      eggAmount,
      error: error.message
    })
    throw error
  }
}

/**
 * Update a user's egg count
 * @param {string} username - The username
 * @param {number} newAmount - New total egg amount
 * @returns {Object|null} - Updated user data or null if failed
 */
export const updateUserEggs = async (username, newAmount) => {
  try {
    const response = await sql(
      'UPDATE eggs SET eggs_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE username_sanitised = $2 RETURNING id, username, eggs_amount',
      [newAmount, username.toLowerCase()]
    )

    if (response.length > 0) {
      logger.info('Updated user eggs in PostgreSQL', {
        username,
        newAmount,
        userId: response[0].id
      })
      return response[0]
    } else {
      logger.warn('No user found to update eggs', { username, newAmount })
      return null
    }

  } catch (error) {
    logger.error('Failed to update user eggs in PostgreSQL', {
      username,
      newAmount,
      error: error.message
    })
    throw error
  }
}

/**
 * Add eggs to a user's current total
 * @param {string} username - The username
 * @param {number} eggsToAdd - Number of eggs to add (can be negative)
 * @param {string} twitchUserId - Optional Twitch user ID
 * @returns {Object|null} - Updated user data
 */
export const addEggsToUser = async (username, eggsToAdd, twitchUserId = null) => {
  try {
    // First try to update existing user
    const updateResult = await sql(
      'UPDATE eggs SET eggs_amount = eggs_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE username_sanitised = $2 RETURNING id, username, eggs_amount',
      [eggsToAdd, username.toLowerCase()]
    )

    if (updateResult.length > 0) {
      logger.info('Added eggs to existing user in PostgreSQL', {
        username,
        eggsAdded: eggsToAdd,
        newTotal: updateResult[0].eggs_amount
      })
      return updateResult[0]
    }

    // User doesn't exist, create them with the egg amount
    logger.info('User not found, creating new egg user', { username, eggsToAdd })
    return await addEggUser(username, Math.max(0, eggsToAdd), twitchUserId)

  } catch (error) {
    logger.error('Failed to add eggs to user in PostgreSQL', {
      username,
      eggsToAdd,
      error: error.message
    })
    throw error
  }
}

/**
 * Get all users ordered by egg count (leaderboard)
 * @param {number} limit - Optional limit for results
 * @returns {Array} - Array of user egg data
 */
export const getAllEggs = async (limit = null) => {
  try {
    let query = 'SELECT id, username, eggs_amount, created_at FROM eggs ORDER BY eggs_amount DESC'
    let params = []

    if (limit) {
      query += ' LIMIT $1'
      params = [limit]
    }

    const response = await sql(query, params)

    logger.debug('Retrieved all eggs from PostgreSQL', {
      totalUsers: response.length
    })

    return response

  } catch (error) {
    logger.error('Failed to get all eggs from PostgreSQL', { error: error.message })
    return []
  }
}

/**
 * Get total number of users in the egg system
 * @returns {number} - Count of users
 */
export const getEggsRowCount = async () => {
  try {
    const response = await sql('SELECT COUNT(*) as count FROM eggs')
    const count = parseInt(response[0].count, 10)

    logger.debug('Retrieved egg row count from PostgreSQL', { count })
    return count

  } catch (error) {
    logger.error('Failed to get eggs row count from PostgreSQL', {
      error: error.message
    })
    return 0
  }
}

/**
 * Get top egg holders (leaderboard)
 * @param {number} limit - Number of top users to return
 * @returns {Array} - Top users by egg count
 */
export const getTopEggHolders = async (limit = 10) => {
  try {
    const response = await sql(
      'SELECT username, eggs_amount FROM eggs ORDER BY eggs_amount DESC LIMIT $1',
      [limit]
    )

    logger.debug('Retrieved top egg holders from PostgreSQL', {
      limit,
      results: response.length
    })

    return response

  } catch (error) {
    logger.error('Failed to get top egg holders from PostgreSQL', {
      limit,
      error: error.message
    })
    return []
  }
}

/**
 * Get statistics about the egg system
 * @returns {Object} - Statistics about eggs
 */
export const getEggStats = async () => {
  try {
    const stats = await sql(`
      SELECT 
        COUNT(*) as total_users,
        SUM(eggs_amount) as total_eggs,
        AVG(eggs_amount) as average_eggs,
        MAX(eggs_amount) as max_eggs,
        MIN(eggs_amount) as min_eggs
      FROM eggs
    `)

    const result = {
      totalUsers: parseInt(stats[0].total_users, 10),
      totalEggs: parseInt(stats[0].total_eggs, 10) || 0,
      averageEggs: parseFloat(stats[0].average_eggs) || 0,
      maxEggs: parseInt(stats[0].max_eggs, 10) || 0,
      minEggs: parseInt(stats[0].min_eggs, 10) || 0
    }

    logger.debug('Retrieved egg statistics from PostgreSQL', result)
    return result

  } catch (error) {
    logger.error('Failed to get egg statistics from PostgreSQL', {
      error: error.message
    })
    return {
      totalUsers: 0,
      totalEggs: 0,
      averageEggs: 0,
      maxEggs: 0,
      minEggs: 0
    }
  }
}

/**
 * Delete a user from the egg system (for admin purposes)
 * @param {string} username - The username to delete
 * @returns {boolean} - Success status
 */
export const deleteEggUser = async (username) => {
  try {
    const response = await sql(
      'DELETE FROM eggs WHERE username_sanitised = $1 RETURNING username',
      [username.toLowerCase()]
    )

    if (response.length > 0) {
      logger.warn('Deleted egg user from PostgreSQL', { username })
      return true
    } else {
      logger.warn('No user found to delete', { username })
      return false
    }

  } catch (error) {
    logger.error('Failed to delete egg user from PostgreSQL', {
      username,
      error: error.message
    })
    return false
  }
}