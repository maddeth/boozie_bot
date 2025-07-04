import { neon } from '@neondatabase/serverless';

async function fixMergeLogSchema() {
  try {
    const databaseUrl = process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require";
    const sql = neon(databaseUrl);

    console.log('Making admin_twitch_id column nullable...');
    await sql`ALTER TABLE user_merge_log ALTER COLUMN admin_twitch_id DROP NOT NULL`;
    
    console.log('Schema fix completed successfully!');
  } catch (error) {
    console.error('Failed to fix schema:', error);
    process.exit(1);
  }
}

fixMergeLogSchema();