import logger from '../utils/logger.js'

export async function up(pool) {
  try {
    // Allow NULL values in the response column for audio-only commands
    await pool.query(`
      ALTER TABLE custom_commands 
      ALTER COLUMN response DROP NOT NULL
    `)
    
    logger.info('Made response column nullable in custom_commands table')
  } catch (error) {
    logger.error('Failed to modify response column', { error })
    throw error
  }
}

export async function down(pool) {
  try {
    // First update any NULL responses to empty strings
    await pool.query(`
      UPDATE custom_commands 
      SET response = '' 
      WHERE response IS NULL
    `)
    
    // Then add the NOT NULL constraint back
    await pool.query(`
      ALTER TABLE custom_commands 
      ALTER COLUMN response SET NOT NULL
    `)
    
    logger.info('Made response column NOT NULL again in custom_commands table')
  } catch (error) {
    logger.error('Failed to restore response column constraint', { error })
    throw error
  }
}