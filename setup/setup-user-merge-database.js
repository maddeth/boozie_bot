import { neon } from '@neondatabase/serverless';
import logger from '../utils/logger.js';

async function setupUserMergeDatabase() {
  try {
    // Get database URL from environment with fallback
    const databaseUrl = process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require";

    // Initialize database connection
    const sql = neon(databaseUrl);

    // Execute SQL statements separately for Neon compatibility
    console.log('Creating user merge log table...');
    
    // Create user merge log table
    await sql`
      CREATE TABLE IF NOT EXISTS user_merge_log (
          id SERIAL PRIMARY KEY,
          source_user_id VARCHAR(255) NOT NULL,
          source_username VARCHAR(255) NOT NULL,
          target_user_id VARCHAR(255) NOT NULL,
          target_username VARCHAR(255) NOT NULL,
          eggs_transferred INTEGER NOT NULL,
          admin_twitch_id VARCHAR(50) NOT NULL,
          admin_username VARCHAR(255) NOT NULL,
          reason TEXT,
          merge_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_user_merge_log_source ON user_merge_log(source_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_merge_log_target ON user_merge_log(target_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_merge_log_admin ON user_merge_log(admin_twitch_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_merge_log_date ON user_merge_log(merge_date)`;
    
    console.log('User merge database setup completed successfully!');
    console.log('Created tables:');
    console.log('  - user_merge_log');
    console.log('Created indexes for performance');

  } catch (error) {
    console.error('Failed to setup user merge database:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  setupUserMergeDatabase();
}

export default setupUserMergeDatabase;