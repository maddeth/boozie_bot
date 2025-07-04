import sql from './db.js'
import logger from '../../utils/logger.js'
import { alertConfig } from '../../config/alertConfig.js'

export async function createAlertsTable() {
  try {
    // Create alerts table
    await sql(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        event_title VARCHAR(255) UNIQUE NOT NULL,
        audio_url TEXT,
        gif_url TEXT,
        duration_ms INTEGER DEFAULT 5000,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    logger.info('Alerts table created successfully')
    
    // Create updated_at trigger
    await sql(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `)
    
    await sql(`
      DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts;
    `)
    
    await sql(`
      CREATE TRIGGER update_alerts_updated_at 
      BEFORE UPDATE ON alerts 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `)
    
    logger.info('Alerts table triggers created successfully')
    
    // Migrate existing config to database
    for (const [eventTitle, config] of Object.entries(alertConfig)) {
      await sql(`
        INSERT INTO alerts (event_title, audio_url, gif_url, duration_ms)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_title) 
        DO UPDATE SET 
          audio_url = EXCLUDED.audio_url,
          gif_url = EXCLUDED.gif_url,
          duration_ms = EXCLUDED.duration_ms,
          updated_at = CURRENT_TIMESTAMP
      `, [eventTitle, config.audio, config.gifUrl || '', config.duration || 5000])
    }
    
    logger.info('Alert configs migrated to database successfully')
    
  } catch (error) {
    logger.error('Error creating alerts table:', error)
    throw error
  }
}