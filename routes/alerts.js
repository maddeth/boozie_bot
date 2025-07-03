import express from 'express'
import { getAllAlerts, getAlert, createAlert, updateAlert, deleteAlert } from '../services/alertService.js'
import { authenticateToken } from '../middleware/auth.js'
import { checkModeratorRole } from '../middleware/checkRole.js'
import logger from '../utils/logger.js'

const router = express.Router()

// Get all alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await getAllAlerts()
    res.json(alerts)
  } catch (error) {
    logger.error('Error fetching alerts:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// Get single alert by event title
router.get('/:eventTitle', async (req, res) => {
  try {
    const alert = await getAlert(req.params.eventTitle)
    if (alert) {
      res.json(alert)
    } else {
      res.status(404).json({ error: 'Alert not found' })
    }
  } catch (error) {
    logger.error('Error fetching alert:', error)
    res.status(500).json({ error: 'Failed to fetch alert' })
  }
})

// Create new alert (moderator only)
router.post('/', authenticateToken, checkModeratorRole, async (req, res) => {
  try {
    const { event_title, audio_url, gif_url, duration_ms } = req.body
    
    if (!event_title || !audio_url) {
      return res.status(400).json({ error: 'Event title and audio URL are required' })
    }
    
    const alert = await createAlert(event_title, audio_url, gif_url || '', duration_ms || 5000)
    res.status(201).json(alert)
  } catch (error) {
    logger.error('Error creating alert:', error)
    if (error.message.includes('duplicate key')) {
      res.status(409).json({ error: 'Alert with this event title already exists' })
    } else {
      res.status(500).json({ error: 'Failed to create alert' })
    }
  }
})

// Update alert (moderator only)
router.put('/:eventTitle', authenticateToken, checkModeratorRole, async (req, res) => {
  try {
    const { audio_url, gif_url, duration_ms, enabled } = req.body
    
    const alert = await updateAlert(req.params.eventTitle, {
      audio_url,
      gif_url,
      duration_ms,
      enabled
    })
    
    if (alert) {
      res.json(alert)
    } else {
      res.status(404).json({ error: 'Alert not found' })
    }
  } catch (error) {
    logger.error('Error updating alert:', error)
    res.status(500).json({ error: 'Failed to update alert' })
  }
})

// Delete alert (moderator only)
router.delete('/:eventTitle', authenticateToken, checkModeratorRole, async (req, res) => {
  try {
    const alert = await deleteAlert(req.params.eventTitle)
    
    if (alert) {
      res.json({ message: 'Alert deleted successfully' })
    } else {
      res.status(404).json({ error: 'Alert not found' })
    }
  } catch (error) {
    logger.error('Error deleting alert:', error)
    res.status(500).json({ error: 'Failed to delete alert' })
  }
})

export default router