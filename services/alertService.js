import sql from './database/db.js'
import logger from '../utils/logger.js'

// Cache alerts in memory with TTL
let alertsCache = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minute

export async function getAlert(eventTitle) {
  try {
    const result = await sql(
      'SELECT * FROM alerts WHERE event_title = $1 AND enabled = true',
      [eventTitle]
    )
    
    if (result.length > 0) {
      const alert = result[0]
      return {
        audio: alert.audio_url,
        gifUrl: alert.gif_url,
        duration: alert.duration_ms
      }
    }
    
    return null
  } catch (error) {
    logger.error('Error fetching alert:', error)
    return null
  }
}

export async function getAllAlerts() {
  // Check cache first
  if (alertsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return alertsCache
  }
  
  try {
    const result = await sql(
      'SELECT * FROM alerts WHERE enabled = true ORDER BY event_title'
    )
    
    // Convert to object format for easy lookup
    const alerts = {}
    result.forEach(row => {
      alerts[row.event_title] = {
        audio: row.audio_url,
        gifUrl: row.gif_url,
        duration: row.duration_ms
      }
    })
    
    // Update cache
    alertsCache = alerts
    cacheTimestamp = Date.now()
    
    return alerts
  } catch (error) {
    logger.error('Error fetching all alerts:', error)
    return {}
  }
}

export async function updateAlert(eventTitle, updates) {
  try {
    const { audio_url, gif_url, duration_ms, enabled } = updates
    
    const result = await sql(`
      UPDATE alerts 
      SET 
        audio_url = COALESCE($2, audio_url),
        gif_url = COALESCE($3, gif_url),
        duration_ms = COALESCE($4, duration_ms),
        enabled = COALESCE($5, enabled),
        updated_at = CURRENT_TIMESTAMP
      WHERE event_title = $1
      RETURNING *
    `, [eventTitle, audio_url, gif_url, duration_ms, enabled])
    
    // Clear cache
    alertsCache = null
    
    return result[0]
  } catch (error) {
    logger.error('Error updating alert:', error)
    throw error
  }
}

export async function createAlert(eventTitle, audio_url, gif_url, duration_ms = 5000) {
  try {
    const result = await sql(`
      INSERT INTO alerts (event_title, audio_url, gif_url, duration_ms)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [eventTitle, audio_url, gif_url, duration_ms])
    
    // Clear cache
    alertsCache = null
    
    return result[0]
  } catch (error) {
    logger.error('Error creating alert:', error)
    throw error
  }
}

export async function deleteAlert(eventTitle) {
  try {
    const result = await sql(
      'DELETE FROM alerts WHERE event_title = $1 RETURNING *',
      [eventTitle]
    )
    
    // Clear cache
    alertsCache = null
    
    return result[0]
  } catch (error) {
    logger.error('Error deleting alert:', error)
    throw error
  }
}