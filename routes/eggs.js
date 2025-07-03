/**
 * Eggs API Routes
 * Provides endpoints for users to view their egg counts and leaderboards
 */

import express from 'express'
import { 
  getUserEggs, 
  getEggLeaderboard, 
  getEggStats,
  getAllUserEggs 
} from '../services/eggServicePostgres.js'
import { getUserBySupabaseId } from '../services/userService.js'
import { authenticateToken } from '../middleware/auth.js'
import logger from '../utils/logger.js'

const router = express.Router()

/**
 * Get current user's egg count
 * Requires authentication
 */
router.get('/my-eggs', authenticateToken, async (req, res) => {
  try {
    logger.debug('Eggs API: my-eggs request', { 
      supabaseUserId: req.user.sub,
      userEmail: req.user.email 
    })
    
    // Get user's Twitch info from Supabase user ID
    const user = await getUserBySupabaseId(req.user.sub)
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found. Please link your Twitch account.' 
      })
    }
    
    if (!user.twitch_user_id) {
      return res.status(400).json({ 
        error: 'No Twitch account linked. Please link your Twitch account to view eggs.' 
      })
    }
    
    // Get user's eggs
    const eggData = await getUserEggs(user.twitch_user_id)
    
    if (!eggData) {
      // User exists but has no eggs yet
      return res.json({
        username: user.username,
        displayName: user.display_name,
        eggs: 0,
        hasEggs: false
      })
    }
    
    res.json({
      username: eggData.username,
      displayName: user.display_name,
      eggs: eggData.eggsAmount,
      hasEggs: true,
      lastUpdated: eggData.updatedAt
    })
    
  } catch (error) {
    logger.error('Failed to get user eggs', { 
      userId: req.user?.id, 
      error: error.message 
    })
    res.status(500).json({ error: 'Failed to retrieve egg data' })
  }
})

/**
 * Get egg leaderboard
 * Public endpoint
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50) // Max 50 users
    const leaderboard = await getEggLeaderboard(limit)
    
    res.json({
      leaderboard: leaderboard.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        eggs: user.eggs_amount,
        lastUpdated: user.updated_at
      })),
      totalShown: leaderboard.length,
      requestedLimit: limit
    })
    
  } catch (error) {
    logger.error('Failed to get egg leaderboard', { error: error.message })
    res.status(500).json({ error: 'Failed to retrieve leaderboard' })
  }
})

/**
 * Get egg statistics
 * Public endpoint
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getEggStats()
    
    res.json({
      totalUsers: stats.totalUsers,
      totalEggs: stats.totalEggs,
      averageEggs: Math.round(stats.averageEggs * 100) / 100, // Round to 2 decimal places
      maxEggs: stats.maxEggs
    })
    
  } catch (error) {
    logger.error('Failed to get egg statistics', { error: error.message })
    res.status(500).json({ error: 'Failed to retrieve statistics' })
  }
})

/**
 * Search for a specific user's eggs
 * Public endpoint (for checking other users)
 */
router.get('/user/:username', async (req, res) => {
  try {
    const username = req.params.username
    
    if (!username || username.length < 2) {
      return res.status(400).json({ error: 'Invalid username' })
    }
    
    const eggData = await getUserEggs(username)
    
    if (!eggData) {
      return res.status(404).json({ 
        error: 'User not found or has no eggs',
        username: username
      })
    }
    
    res.json({
      username: eggData.username,
      eggs: eggData.eggsAmount,
      lastUpdated: eggData.updatedAt
    })
    
  } catch (error) {
    logger.error('Failed to get user eggs by username', { 
      username: req.params.username, 
      error: error.message 
    })
    res.status(500).json({ error: 'Failed to retrieve user data' })
  }
})

/**
 * Get all users with eggs (for admin/moderator view)
 * Requires authentication and admin privileges
 */
router.get('/all', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin/moderator
    const user = await getUserBySupabaseId(req.user.sub)
    
    if (!user || (!user.is_admin && !user.is_moderator && !user.is_superadmin)) {
      return res.status(403).json({ error: 'Admin privileges required' })
    }
    
    const limit = Math.min(parseInt(req.query.limit) || 100, 500) // Max 500 users
    const orderBy = req.query.order === 'username' ? 'username' : 'eggs'
    
    const allUsers = await getAllUserEggs(limit, orderBy)
    
    res.json({
      users: allUsers.map(user => ({
        username: user.username,
        eggs: user.eggs_amount,
        twitchUserId: user.twitch_user_id,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      })),
      totalShown: allUsers.length,
      orderBy: orderBy,
      requestedLimit: limit
    })
    
  } catch (error) {
    logger.error('Failed to get all user eggs', { 
      userId: req.user?.id, 
      error: error.message 
    })
    res.status(500).json({ error: 'Failed to retrieve user data' })
  }
})

export default router