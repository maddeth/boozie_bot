import logger from '../utils/logger.js'

export async function up(pool) {
  try {
    // Add trigger_type column with default 'exact' for existing commands
    await pool.query(`
      ALTER TABLE custom_commands 
      ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(20) DEFAULT 'exact' NOT NULL
    `)
    
    // Add check constraint to ensure valid trigger types (if not exists)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'check_trigger_type' 
          AND table_name = 'custom_commands'
        ) THEN
          ALTER TABLE custom_commands 
          ADD CONSTRAINT check_trigger_type 
          CHECK (trigger_type IN ('exact', 'contains', 'regex'));
        END IF;
      END $$;
    `)
    
    // Add audio_url column for linking audio files to commands
    await pool.query(`
      ALTER TABLE custom_commands 
      ADD COLUMN IF NOT EXISTS audio_url TEXT
    `)
    
    logger.info('Added trigger_type and audio_url columns to custom_commands table')
  } catch (error) {
    logger.error('Failed to add columns to custom_commands', { error })
    throw error
  }
}

export async function down(pool) {
  try {
    await pool.query(`
      ALTER TABLE custom_commands 
      DROP CONSTRAINT IF EXISTS check_trigger_type
    `)
    
    await pool.query(`
      ALTER TABLE custom_commands 
      DROP COLUMN IF EXISTS trigger_type
    `)
    
    await pool.query(`
      ALTER TABLE custom_commands 
      DROP COLUMN IF EXISTS audio_url
    `)
    
    logger.info('Removed trigger_type and audio_url columns from custom_commands table')
  } catch (error) {
    logger.error('Failed to remove columns from custom_commands', { error })
    throw error
  }
}