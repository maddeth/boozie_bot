#!/usr/bin/env node

/**
 * Database Setup Script for Custom Commands Table
 * Creates the PostgreSQL schema for the custom commands system
 */

import { neon } from "@neondatabase/serverless"

// Use the same database URL as the other systems
const sql = neon(process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require")

console.log('🗄️  Setting up PostgreSQL custom commands database schema...')

async function setupCommandsDatabase() {
    try {
        console.log('📋 Creating custom_commands table and indexes...')
        
        // 1. Create the table
        await sql(`
          CREATE TABLE IF NOT EXISTS custom_commands (
            id SERIAL PRIMARY KEY,
            trigger VARCHAR(255) UNIQUE NOT NULL,
            response TEXT NOT NULL,
            cooldown INTEGER DEFAULT 0 NOT NULL,
            permission VARCHAR(50) DEFAULT 'everyone' NOT NULL,
            enabled BOOLEAN DEFAULT true NOT NULL,
            usage_count INTEGER DEFAULT 0 NOT NULL,
            created_by VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP,
            CONSTRAINT valid_permission CHECK (permission IN ('everyone', 'subscriber', 'vip', 'moderator'))
          )
        `)
        
        // 2. Create indexes
        await sql('CREATE INDEX IF NOT EXISTS idx_commands_trigger ON custom_commands(trigger)')
        await sql('CREATE INDEX IF NOT EXISTS idx_commands_enabled ON custom_commands(enabled)')
        await sql('CREATE INDEX IF NOT EXISTS idx_commands_permission ON custom_commands(permission)')
        
        // 3. Create trigger function for updated_at
        await sql(`
          CREATE OR REPLACE FUNCTION update_commands_updated_at()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
          END;
          $$ language 'plpgsql'
        `)
        
        // 4. Create trigger
        await sql('DROP TRIGGER IF EXISTS update_commands_updated_at ON custom_commands')
        await sql(`
          CREATE TRIGGER update_commands_updated_at
              BEFORE UPDATE ON custom_commands
              FOR EACH ROW
              EXECUTE PROCEDURE update_commands_updated_at()
        `)
        
        // 5. Create command cooldowns table for per-user cooldowns
        await sql(`
          CREATE TABLE IF NOT EXISTS command_cooldowns (
            id SERIAL PRIMARY KEY,
            command_id INTEGER NOT NULL REFERENCES custom_commands(id) ON DELETE CASCADE,
            username VARCHAR(255) NOT NULL,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(command_id, username)
          )
        `)
        
        // 6. Create index for cooldowns
        await sql('CREATE INDEX IF NOT EXISTS idx_cooldowns_command_username ON command_cooldowns(command_id, username)')
        
        console.log('✅ Custom commands database schema created successfully!')
        
        // Test the connection by checking if the table exists
        const tableCheck = await sql("SELECT table_name FROM information_schema.tables WHERE table_name = 'custom_commands'")
        
        if (tableCheck.length > 0) {
            console.log('✅ Custom commands table confirmed in database')
            
            // Check current row count
            const rowCount = await sql('SELECT COUNT(*) as count FROM custom_commands')
            console.log(`📊 Current custom commands: ${rowCount[0].count}`)
            
            // Add some default commands
            console.log('📝 Adding default commands...')
            
            // Insert default commands (ignore if they already exist)
            await sql(`
              INSERT INTO custom_commands (trigger, response, cooldown, permission, created_by)
              VALUES 
                ('!commands', 'Check out all available commands at: https://maddeth.com/commands', 30, 'everyone', 'system'),
                ('!socials', 'Follow me on Twitter: @maddeth', 60, 'everyone', 'system'),
                ('!lurk', '{user} is lurking in the shadows... 👀', 0, 'everyone', 'system')
              ON CONFLICT (trigger) DO NOTHING
            `)
            
            console.log('✅ Default commands added')
            
        } else {
            console.error('❌ Failed to create custom_commands table')
            process.exit(1)
        }
        
        console.log('\n🎉 Database setup complete!')
        console.log('ℹ️  Custom commands system is ready to use')
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message)
        process.exit(1)
    }
}

// Run the setup
setupCommandsDatabase()