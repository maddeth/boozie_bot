import { getUserBySupabaseId } from '../services/userService.js'
import logger from '../utils/logger.js'

/**
 * Middleware to check if user has moderator role
 */
export async function checkModeratorRole(req, res, next) {
  try {
    // First check if user is authenticated
    if (!req.user || !req.user.sub) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      })
    }
    
    const supabaseUserId = req.user.sub
    const user = await getUserBySupabaseId(supabaseUserId)
    
    if (!user) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User not found'
      })
    }
    
    // Check if user is moderator or admin (admins have all moderator privileges)
    if (!user.is_moderator && !user.is_admin) {
      logger.warn('Non-moderator attempted to access moderator endpoint', {
        userId: user.twitch_user_id,
        username: user.username,
        endpoint: req.path
      })
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Moderator privileges required'
      })
    }
    
    // Attach user to request for use in route handlers
    req.userRole = user
    next()
    
  } catch (error) {
    logger.error('Error checking moderator role', {
      error: error.message,
      userId: req.user?.sub
    })
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify permissions'
    })
  }
}

/**
 * Middleware to check if user has admin role
 */
export async function checkAdminRole(req, res, next) {
  try {
    // First check if user is authenticated
    if (!req.user || !req.user.sub) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      })
    }
    
    const supabaseUserId = req.user.sub
    const user = await getUserBySupabaseId(supabaseUserId)
    
    if (!user) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User not found'
      })
    }
    
    // Check if user is admin
    if (!user.is_admin) {
      logger.warn('Non-admin attempted to access admin endpoint', {
        userId: user.twitch_user_id,
        username: user.username,
        endpoint: req.path
      })
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin privileges required'
      })
    }
    
    // Attach user to request for use in route handlers
    req.userRole = user
    next()
    
  } catch (error) {
    logger.error('Error checking admin role', {
      error: error.message,
      userId: req.user?.sub
    })
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify permissions'
    })
  }
}