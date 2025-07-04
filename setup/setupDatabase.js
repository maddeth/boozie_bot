#!/usr/bin/env node

/**
 * Database Setup Script
 * Creates the users table and sets up the role management system
 */

import { neon } from "@neondatabase/serverless"
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sql = neon(process.env.DATABASE_URL)

async function setupDatabase() {
    console.log('🗄️  Database Setup Script')
    console.log('=========================')
    
    try {
        console.log('📋 Creating users table and related structures...')
        
        // Execute each statement separately for Neon compatibility
        console.log('  → Creating users table...')
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                twitch_user_id VARCHAR(50) UNIQUE NOT NULL,
                username VARCHAR(255) NOT NULL,
                display_name VARCHAR(255),
                email VARCHAR(255),
                supabase_user_id UUID,
                
                -- Role and privilege columns
                is_moderator BOOLEAN DEFAULT FALSE,
                is_admin BOOLEAN DEFAULT FALSE,
                is_vip BOOLEAN DEFAULT FALSE,
                is_subscriber BOOLEAN DEFAULT FALSE,
                subscription_tier VARCHAR(10) DEFAULT '0',
                
                -- Privilege timestamps for tracking changes
                moderator_since TIMESTAMP NULL,
                moderator_updated TIMESTAMP NULL,
                subscription_updated TIMESTAMP NULL,
                
                -- Standard timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `
        
        console.log('  → Creating indexes...')
        await sql`CREATE INDEX IF NOT EXISTS idx_users_twitch_id ON users(twitch_user_id)`
        await sql`CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_user_id)`
        await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`
        await sql`CREATE INDEX IF NOT EXISTS idx_users_moderator ON users(is_moderator)`
        
        console.log('  → Creating update trigger function...')
        await sql`
            CREATE OR REPLACE FUNCTION update_users_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `
        
        console.log('  → Creating update trigger...')
        await sql`DROP TRIGGER IF EXISTS trigger_users_updated_at ON users`
        await sql`
            CREATE TRIGGER trigger_users_updated_at
                BEFORE UPDATE ON users
                FOR EACH ROW
                EXECUTE FUNCTION update_users_updated_at()
        `
        
        console.log('✅ Users table created successfully!')
        
        // Check if the table was created properly
        const tableInfo = await sql(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `)
        
        console.log('\n📊 Table structure:')
        tableInfo.forEach(col => {
            console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`)
        })
        
        // Check indexes
        const indexes = await sql(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'users'
        `)
        
        console.log('\n🔍 Indexes created:')
        indexes.forEach(idx => {
            console.log(`   ${idx.indexname}`)
        })
        
        console.log('\n🎉 Database setup completed successfully!')
        console.log('\nYou can now:')
        console.log('1. Start your bot - it will automatically sync moderators when stream is live')
        console.log('2. Use the API endpoints:')
        console.log('   - GET /api/user/me - Get current user\'s role info')
        console.log('   - GET /api/user/me/moderator - Check if current user is moderator')
        console.log('   - GET /api/user/moderators - Get list of moderators (mod only)')
        console.log('   - GET /api/user/stats - Get user statistics (mod only)')
        console.log('   - GET /api/user/check/:twitchUserId - Check if user is moderator')
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message)
        
        if (error.message.includes('relation "users" already exists')) {
            console.log('\n💡 Table already exists. Checking current structure...')
            
            try {
                const existingTable = await sql(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'users'
                `)
                
                console.log('📊 Existing table structure:')
                existingTable.forEach(col => {
                    console.log(`   ${col.column_name}: ${col.data_type}`)
                })
                
                console.log('\n✅ Database is already set up!')
                
            } catch (checkError) {
                console.error('❌ Failed to check existing table:', checkError.message)
            }
        }
        
        process.exit(1)
    }
}

// Run the setup
if (import.meta.url === `file://${process.argv[1]}`) {
    setupDatabase()
        .then(() => {
            console.log('\n🚀 Setup complete! Your moderator privilege sync system is ready.')
            process.exit(0)
        })
        .catch((error) => {
            console.error('\n❌ Setup failed:', error.message)
            process.exit(1)
        })
}

export default setupDatabase