/**
 * Custom Commands API Routes
 * Provides endpoints for managing custom bot commands
 */

import express from 'express'
import logger from '../utils/logger.js'
import { authenticateToken } from '../middleware/auth.js'
import sql from '../services/database/db.js'
import dotenv from 'dotenv'
import { getUserBySupabaseId } from '../services/userService.js'

// Will be set by the main server
let twitchService = null
export const setTwitchService = (ts) => {
  twitchService = ts
}

// Load environment variables

const router = express.Router()

/**
 * Get all custom commands
 * Public endpoint - anyone can view commands
 */
router.get('/', async (req, res) => {
  try {
    const commands = await sql(`
      SELECT id, trigger, response, cooldown, permission, enabled, usage_count, created_by, created_at,
             COALESCE(trigger_type, 'exact') as trigger_type, audio_url, 
             COALESCE(egg_cost, 0) as egg_cost
      FROM custom_commands
      WHERE enabled = true
      ORDER BY trigger ASC
    `)
    
    logger.info('Commands list requested', { count: commands.length })
    
    res.json({
      commands,
      count: commands.length
    })
    
  } catch (error) {
    logger.error('Error getting commands list', { error: error.message })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve commands'
    })
  }
})

/**
 * Get all commands including disabled ones
 * Requires moderator privileges
 */
router.get('/all', authenticateToken, async (req, res) => {
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
    
    const commands = await sql(`
      SELECT id, trigger, response, cooldown, permission, enabled, usage_count, 
             created_by, created_at, updated_at, last_used_at,
             COALESCE(trigger_type, 'exact') as trigger_type, audio_url,
             COALESCE(egg_cost, 0) as egg_cost
      FROM custom_commands
      ORDER BY trigger ASC
    `)
    
    logger.info('All commands requested by moderator', { 
      moderator: requestingUser.username,
      count: commands.length 
    })
    
    res.json({
      commands,
      count: commands.length
    })
    
  } catch (error) {
    logger.error('Error getting all commands', { 
      supabaseUserId: req.user?.sub,
      error: error.message 
    })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve commands'
    })
  }
})

/**
 * Get a specific command by trigger
 */
router.get('/trigger/:trigger', async (req, res) => {
  try {
    const { trigger } = req.params
    
    const commands = await sql(
      'SELECT * FROM custom_commands WHERE trigger = $1 AND enabled = true',
      [trigger]
    )
    
    if (commands.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Command not found'
      })
    }
    
    res.json(commands[0])
    
  } catch (error) {
    logger.error('Error getting command by trigger', { 
      trigger: req.params.trigger,
      error: error.message 
    })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to retrieve command'
    })
  }
})

/**
 * Create a new command
 * Requires bot admin privileges
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)
    
    // Check if requesting user is a bot admin
    if (!requestingUser || !requestingUser.is_admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Bot admin privileges required'
      })
    }
    
    const { trigger, response, cooldown = 0, permission = 'everyone', trigger_type = 'exact', audio_url, egg_cost = 0 } = req.body
    
    logger.debug('Command creation request', { trigger, response, cooldown, permission, trigger_type, audio_url })
    
    // Validate input
    if (!trigger) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Trigger is required'
      })
    }
    
    if ((!response || response.trim() === '') && (!audio_url || audio_url.trim() === '')) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Either response or audio_url is required'
      })
    }
    
    // Validate permission level
    const validPermissions = ['everyone', 'subscriber', 'vip', 'moderator']
    if (!validPermissions.includes(permission)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid permission level'
      })
    }
    
    // Validate trigger type
    const validTriggerTypes = ['exact', 'contains', 'regex']
    if (!validTriggerTypes.includes(trigger_type)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid trigger type'
      })
    }
    
    // Validate regex pattern if trigger_type is regex
    if (trigger_type === 'regex') {
      try {
        new RegExp(trigger)
      } catch (error) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid regex pattern'
        })
      }
    }
    
    // Check if command already exists
    const existing = await sql(
      'SELECT id FROM custom_commands WHERE trigger = $1',
      [trigger]
    )
    
    if (existing.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Command with this trigger already exists'
      })
    }
    
    // Create the command
    const newCommand = await sql(`
      INSERT INTO custom_commands (trigger, response, cooldown, permission, created_by, trigger_type, audio_url, egg_cost)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      trigger, 
      response || null, 
      cooldown, 
      permission, 
      requestingUser.username, 
      trigger_type, 
      audio_url || null,
      egg_cost
    ])
    
    logger.info('Command created', {
      trigger,
      createdBy: requestingUser.username
    })
    
    // Notify bot to reload commands
    if (twitchService) {
      await twitchService.reloadCustomCommands()
    }
    
    res.status(201).json(newCommand[0])
    
  } catch (error) {
    logger.error('Error creating command', { 
      supabaseUserId: req.user?.sub,
      error: error.message 
    })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to create command'
    })
  }
})

/**
 * Update an existing command
 * Requires bot admin privileges
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)
    
    // Check if requesting user is a bot admin
    if (!requestingUser || !requestingUser.is_admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Bot admin privileges required'
      })
    }
    
    const { id } = req.params
    const { trigger, response, cooldown, permission, enabled, trigger_type, audio_url, egg_cost } = req.body
    
    // Check if command exists
    const existing = await sql(
      'SELECT * FROM custom_commands WHERE id = $1',
      [id]
    )
    
    if (existing.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Command not found'
      })
    }
    
    // Build update query dynamically
    const updates = []
    const values = []
    let valueIndex = 1
    
    if (trigger !== undefined) {
      // Check if new trigger conflicts with existing command
      const conflict = await sql(
        'SELECT id FROM custom_commands WHERE trigger = $1 AND id != $2',
        [trigger, id]
      )
      
      if (conflict.length > 0) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Another command with this trigger already exists'
        })
      }
      
      updates.push(`trigger = $${valueIndex}`)
      values.push(trigger)
      valueIndex++
    }
    
    if (response !== undefined) {
      updates.push(`response = $${valueIndex}`)
      values.push(response)
      valueIndex++
    }
    
    if (cooldown !== undefined) {
      updates.push(`cooldown = $${valueIndex}`)
      values.push(cooldown)
      valueIndex++
    }
    
    if (permission !== undefined) {
      // Validate permission level
      const validPermissions = ['everyone', 'subscriber', 'vip', 'moderator']
      if (!validPermissions.includes(permission)) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid permission level'
        })
      }
      
      updates.push(`permission = $${valueIndex}`)
      values.push(permission)
      valueIndex++
    }
    
    if (enabled !== undefined) {
      updates.push(`enabled = $${valueIndex}`)
      values.push(enabled)
      valueIndex++
    }
    
    if (trigger_type !== undefined) {
      // Validate trigger type
      const validTriggerTypes = ['exact', 'contains', 'regex']
      if (!validTriggerTypes.includes(trigger_type)) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid trigger type'
        })
      }
      
      // Validate regex pattern if trigger_type is regex
      if (trigger_type === 'regex' && trigger !== undefined) {
        try {
          new RegExp(trigger)
        } catch (error) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'Invalid regex pattern'
          })
        }
      }
      
      updates.push(`trigger_type = $${valueIndex}`)
      values.push(trigger_type)
      valueIndex++
    }
    
    if (audio_url !== undefined) {
      updates.push(`audio_url = $${valueIndex}`)
      values.push(audio_url)
      valueIndex++
    }
    
    if (egg_cost !== undefined) {
      updates.push(`egg_cost = $${valueIndex}`)
      values.push(egg_cost)
      valueIndex++
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No valid fields to update'
      })
    }
    
    values.push(id)
    
    const updatedCommand = await sql(`
      UPDATE custom_commands
      SET ${updates.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `, values)
    
    logger.info('Command updated', {
      id,
      updatedBy: requestingUser.username,
      changes: updates
    })
    
    // Notify bot to reload commands
    if (twitchService) {
      await twitchService.reloadCustomCommands()
    }
    
    res.json(updatedCommand[0])
    
  } catch (error) {
    logger.error('Error updating command', { 
      supabaseUserId: req.user?.sub,
      commandId: req.params.id,
      error: error.message 
    })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to update command'
    })
  }
})

/**
 * Delete a command
 * Requires bot admin privileges
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const supabaseUserId = req.user.sub
    const requestingUser = await getUserBySupabaseId(supabaseUserId)
    
    // Check if requesting user is a bot admin
    if (!requestingUser || !requestingUser.is_admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Bot admin privileges required'
      })
    }
    
    const { id } = req.params
    
    // Check if command exists
    const existing = await sql(
      'SELECT trigger FROM custom_commands WHERE id = $1',
      [id]
    )
    
    if (existing.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Command not found'
      })
    }
    
    // Delete the command
    await sql('DELETE FROM custom_commands WHERE id = $1', [id])
    
    logger.info('Command deleted', {
      id,
      trigger: existing[0].trigger,
      deletedBy: requestingUser.username
    })
    
    // Notify bot to reload commands
    if (twitchService) {
      await twitchService.reloadCustomCommands()
    }
    
    res.status(204).send()
    
  } catch (error) {
    logger.error('Error deleting command', { 
      supabaseUserId: req.user?.sub,
      commandId: req.params.id,
      error: error.message 
    })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to delete command'
    })
  }
})

/**
 * Increment usage count for a command
 * Internal endpoint - should be called by bot when command is used
 */
router.post('/:id/usage', async (req, res) => {
  try {
    const { id } = req.params
    
    await sql(`
      UPDATE custom_commands
      SET usage_count = usage_count + 1,
          last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id])
    
    res.status(204).send()
    
  } catch (error) {
    logger.error('Error updating command usage', { 
      commandId: req.params.id,
      error: error.message 
    })
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to update usage count'
    })
  }
})

export default router