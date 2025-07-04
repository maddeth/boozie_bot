import { promises as fs } from 'fs'
import path from 'path'
import { neon } from '@neondatabase/serverless'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function setupPoolsDatabase() {
  try {
    // Get database URL from environment with fallback
    const databaseUrl = process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require"

    // Initialize database connection
    const sql = neon(databaseUrl)

    // Execute SQL statements separately for Neon compatibility
    console.log('Creating pools tables...')
    
    // Create pools table
    await sql`
      CREATE TABLE IF NOT EXISTS pools (
          id SERIAL PRIMARY KEY,
          pool_name VARCHAR(255) UNIQUE NOT NULL,
          pool_name_sanitised VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          eggs_amount INTEGER DEFAULT 0 NOT NULL CHECK (eggs_amount >= 0),
          created_by_twitch_id VARCHAR(50) NOT NULL,
          created_by_username VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    
    // Create indexes for pools
    await sql`CREATE INDEX IF NOT EXISTS idx_pools_name_sanitised ON pools(pool_name_sanitised)`
    await sql`CREATE INDEX IF NOT EXISTS idx_pools_created_by ON pools(created_by_twitch_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_pools_active ON pools(is_active)`
    
    // Create pool transactions table
    await sql`
      CREATE TABLE IF NOT EXISTS pool_transactions (
          id SERIAL PRIMARY KEY,
          pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
          donor_twitch_id VARCHAR(50) NOT NULL,
          donor_username VARCHAR(255) NOT NULL,
          eggs_amount INTEGER NOT NULL CHECK (eggs_amount > 0),
          transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('donation', 'withdrawal', 'admin_add', 'admin_remove')),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    
    // Create indexes for transactions
    await sql`CREATE INDEX IF NOT EXISTS idx_pool_transactions_pool_id ON pool_transactions(pool_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_pool_transactions_donor ON pool_transactions(donor_twitch_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_pool_transactions_date ON pool_transactions(created_at)`
    
    // Create update trigger function
    await sql`
      CREATE OR REPLACE FUNCTION update_pools_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `
    
    // Create trigger
    await sql`DROP TRIGGER IF EXISTS update_pools_updated_at_trigger ON pools`
    await sql`
      CREATE TRIGGER update_pools_updated_at_trigger
      BEFORE UPDATE ON pools
      FOR EACH ROW
      EXECUTE FUNCTION update_pools_updated_at()
    `
    
    // Add constraint for reserved pool names (if not exists)
    try {
      await sql`
        ALTER TABLE pools ADD CONSTRAINT pool_name_reserved_prefix 
        CHECK (pool_name_sanitised LIKE 'pool_%' OR pool_name_sanitised LIKE 'community_%')
      `
    } catch (error) {
      if (error.code === '42710') {
        console.log('Constraint pool_name_reserved_prefix already exists, skipping...')
      } else {
        throw error
      }
    }
    
    console.log('Pools database setup completed successfully!')
    console.log('Created tables:')
    console.log('  - pools')
    console.log('  - pool_transactions')
    console.log('Created indexes and constraints')

  } catch (error) {
    console.error('Failed to setup pools database:', error)
    process.exit(1)
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupPoolsDatabase()
}

export default setupPoolsDatabase