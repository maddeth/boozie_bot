import logger from '../utils/logger.js'

export async function up(pool) {
  try {
    // Add egg_cost column for premium commands
    await pool.query(`
      ALTER TABLE custom_commands 
      ADD COLUMN IF NOT EXISTS egg_cost INTEGER DEFAULT 0 NOT NULL
    `)
    
    logger.info('Added egg_cost column to custom_commands table')
  } catch (error) {
    logger.error('Failed to add egg_cost column', { error })
    throw error
  }
}

export async function down(pool) {
  try {
    await pool.query(`
      ALTER TABLE custom_commands 
      DROP COLUMN IF EXISTS egg_cost
    `)
    
    logger.info('Removed egg_cost column from custom_commands table')
  } catch (error) {
    logger.error('Failed to remove egg_cost column', { error })
    throw error
  }
}