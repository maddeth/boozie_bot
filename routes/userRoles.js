/**
 * User Roles API Routes
 * Provides endpoints for checking and managing user privileges
 */

import express from 'express'
import logger from '../utils/logger.js'
import { authenticateToken } from '../middleware/auth.js'
import sql from '../services/database/db.js'
import dotenv from 'dotenv'
import {
  getUserBySupabaseId,
  getUserByTwitchId,
  getModerators,
  getUserStats,
  isModerator,
  linkSupabaseUser
} from '../services/userService.js'
import { syncSingleModerator } from '../services/moderatorSyncService.js'
import twitchService from '../services/twitchService.js'
import config from '../config.json' with { type: "json" }

// Load environment variables

const router = express.Router()

/**
 * Get current user's role and privileges
 * Requires authentication
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub

    // Get user from database using Supabase ID
    const user = await getUserBySupabaseId(supabaseUserId)

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user record found. Please visit the stream to create your profile.'
      })
    }

    // Return user role information
    const roleInfo = {
      username: user.username,
      displayName: user.display_name,
      twitchUserId: user.twitch_user_id,
      roles: {
        isModerator: user.is_moderator,
        isAdmin: user.is_admin,
        isSuperAdmin: user.is_superadmin || false,
        isVip: user.is_vip,
        isSubscriber: user.is_subscriber
      },
      subscriptionTier: user.subscription_tier,
      moderatorSince: user.moderator_since,
      lastSeen: user.last_seen
    }

    logger.info('User role info requested', {
      supabaseUserId,
      username: user.username,
      roles: roleInfo.roles
    })

    res.json(roleInfo)

  } catch (error) {
    logger.error('Error getting user role info', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user information'
    })
  }
})

/**
 * Check if current user is a moderator
 * Requires authentication
 */
router.get('/me/moderator', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const user = await getUserBySupabaseId(supabaseUserId)

    if (!user) {
      return res.status(404).json({
        isModerator: false,
        message: 'User not found'
      })
    }

    res.json({
      isModerator: user.is_moderator,
      moderatorSince: user.moderator_since
    })

  } catch (error) {
    logger.error('Error checking moderator status', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      isModerator: false
    })
  }
})

/**
 * Get list of all moderators
 * Requires moderator privileges
 */
router.get('/moderators', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    // Check if requesting user is a moderator
    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const moderators = await getModerators()

    // Return sanitized moderator list
    const moderatorList = moderators.map(mod => ({
      username: mod.username,
      displayName: mod.display_name,
      moderatorSince: mod.moderator_since,
      lastSeen: mod.last_seen
    }))

    logger.info('Moderator list requested', {
      requestedBy: requestingUser.username,
      moderatorCount: moderatorList.length
    })

    res.json({
      moderators: moderatorList,
      count: moderatorList.length
    })

  } catch (error) {
    logger.error('Error getting moderators list', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve moderators list'
    })
  }
})

/**
 * Get user statistics
 * Requires moderator privileges
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    // Check if requesting user is a moderator
    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const stats = await getUserStats()

    logger.info('User statistics requested', {
      requestedBy: requestingUser.username,
      stats
    })

    res.json(stats)

  } catch (error) {
    logger.error('Error getting user statistics', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user statistics'
    })
  }
})

/**
 * Check if a specific Twitch user is a moderator
 * Public endpoint (no auth required)
 */
router.get('/check/:twitchUserId', async (req, res) => {
  try {
    const { twitchUserId } = req.params

    if (!twitchUserId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Twitch user ID is required'
      })
    }

    const isModeratorStatus = await isModerator(twitchUserId)

    res.json({
      twitchUserId,
      isModerator: isModeratorStatus
    })

  } catch (error) {
    logger.error('Error checking specific user moderator status', {
      twitchUserId: req.params.twitchUserId,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      isModerator: false
    })
  }
})

/**
 * Link Supabase user to existing Twitch user
 * Requires authentication
 */
router.post('/link', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const { twitchUsername, email } = req.body

    if (!twitchUsername) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Twitch username is required'
      })
    }

    // Find existing user by Twitch username
    const existingUsers = await sql(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [twitchUsername]
    )

    if (existingUsers.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No Twitch user found with that username'
      })
    }

    const twitchUser = existingUsers[0]

    // Link the accounts
    const success = await linkSupabaseUser(twitchUser.twitch_user_id, supabaseUserId, email)

    if (success) {
      logger.info('Linked Supabase user to Twitch user', {
        twitchUsername,
        twitchUserId: twitchUser.twitch_user_id,
        supabaseUserId
      })

      res.json({
        success: true,
        message: 'Accounts linked successfully',
        user: {
          username: twitchUser.username,
          twitchUserId: twitchUser.twitch_user_id,
          isModerator: twitchUser.is_moderator
        }
      })
    } else {
      res.status(500).json({
        error: 'Link failed',
        message: 'Failed to link accounts'
      })
    }

  } catch (error) {
    logger.error('Error linking accounts', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to link accounts'
    })
  }
})

/**
 * Refresh current user's moderator status from Twitch
 * Requires authentication
 */
router.post('/me/refresh', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub

    // Get user from database
    const user = await getUserBySupabaseId(supabaseUserId)

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user record found. Please visit the stream to create your profile.'
      })
    }

    // Sync this user's moderator status with Twitch
    const syncResult = await syncSingleModerator(
      twitchService,
      config.myChannelUserId,
      user.username
    )

    if (syncResult.success) {
      logger.info('User moderator status refreshed', {
        username: user.username,
        isModerator: syncResult.isModerator,
        supabaseUserId
      })

      // Get updated user info
      const updatedUser = await getUserBySupabaseId(supabaseUserId)

      res.json({
        success: true,
        message: 'Moderator status refreshed successfully',
        roleInfo: {
          username: updatedUser.username,
          displayName: updatedUser.display_name,
          twitchUserId: updatedUser.twitch_user_id,
          roles: {
            isModerator: updatedUser.is_moderator,
            isAdmin: updatedUser.is_admin,
            isVip: updatedUser.is_vip,
            isSubscriber: updatedUser.is_subscriber
          },
          subscriptionTier: updatedUser.subscription_tier,
          moderatorSince: updatedUser.moderator_since,
          lastSeen: updatedUser.last_seen
        }
      })
    } else {
      res.status(500).json({
        error: 'Sync failed',
        message: syncResult.error || 'Failed to sync moderator status'
      })
    }

  } catch (error) {
    logger.error('Error refreshing moderator status', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to refresh moderator status'
    })
  }
})

/**
 * Update user's bot admin status
 * Requires superadmin privileges
 */
router.put('/admin/:username', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const { username } = req.params
    const { isAdmin } = req.body

    // Check if requesting user is a superadmin
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    if (!requestingUser || !requestingUser.is_superadmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Superadmin privileges required'
      })
    }

    // Validate input
    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'isAdmin must be a boolean value'
      })
    }

    // Update the target user's admin status
    const result = await sql(
      `UPDATE users 
       SET is_admin = $1, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(username) = LOWER($2)
       RETURNING username, is_admin, is_moderator`,
      [isAdmin, username]
    )

    if (result.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: `User ${username} not found in database`
      })
    }

    logger.info('Bot admin status updated', {
      updatedBy: requestingUser.username,
      targetUser: username,
      isAdmin: isAdmin
    })

    res.json({
      success: true,
      message: `${username} bot admin status updated`,
      user: result[0]
    })

  } catch (error) {
    logger.error('Error updating bot admin status', {
      supabaseUserId: req.user?.sub,
      targetUsername: req.params.username,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update bot admin status'
    })
  }
})

/**
 * Get list of all bot admins
 * Requires moderator privileges
 */
router.get('/admins', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    // Check if requesting user is at least a moderator
    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const admins = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, last_seen
      FROM users
      WHERE is_admin = true OR is_superadmin = true
      ORDER BY is_superadmin DESC, username ASC
    `)

    logger.info('Bot admins list requested', {
      requestedBy: requestingUser.username,
      adminCount: admins.length
    })

    res.json({
      admins,
      count: admins.length
    })

  } catch (error) {
    logger.error('Error getting bot admins list', {
      supabaseUserId: req.user?.sub,
      error: error.message
    })
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve bot admins list'
    })
  }
})

/**
 * Get detailed user lists for statistics
 * Requires moderator privileges
 */

// All users
router.get('/stats/users', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const users = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, is_vip, 
             is_subscriber, subscription_tier, last_seen, created_at
      FROM users
      ORDER BY last_seen DESC NULLS LAST
      LIMIT 100
    `)

    res.json({ users })
  } catch (error) {
    logger.error('Error getting users list', { error: error.message })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Moderators only
router.get('/stats/moderators', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const users = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, is_vip, 
             is_subscriber, subscription_tier, last_seen, created_at, moderator_since
      FROM users
      WHERE is_moderator = true
      ORDER BY moderator_since ASC NULLS LAST
    `)

    res.json({ users })
  } catch (error) {
    logger.error('Error getting moderators list', { error: error.message })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Subscribers only
router.get('/stats/subscribers', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const users = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, is_vip, 
             is_subscriber, subscription_tier, last_seen, created_at
      FROM users
      WHERE is_subscriber = true
      ORDER BY subscription_tier DESC, last_seen DESC
    `)

    res.json({ users })
  } catch (error) {
    logger.error('Error getting subscribers list', { error: error.message })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Registered users (with Supabase account)
router.get('/stats/registered', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const users = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, is_vip, 
             is_subscriber, subscription_tier, last_seen, created_at
      FROM users
      WHERE supabase_user_id IS NOT NULL
      ORDER BY created_at DESC
    `)

    res.json({ users })
  } catch (error) {
    logger.error('Error getting registered users list', { error: error.message })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Active this week
router.get('/stats/active-weekly', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)

    if (!requestingUser || !requestingUser.is_moderator) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }

    const users = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, is_vip, 
             is_subscriber, subscription_tier, last_seen, created_at
      FROM users
      WHERE last_seen > NOW() - INTERVAL '7 days'
      ORDER BY last_seen DESC
    `)

    res.json({ users })
  } catch (error) {
    logger.error('Error getting active users list', { error: error.message })
    res.status(500).json({ error: error.message })
  }
})

export default router