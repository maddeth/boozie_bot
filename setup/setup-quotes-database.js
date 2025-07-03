#!/usr/bin/env node

/**
 * Database Setup Script for Quotes Table
 * Creates the PostgreSQL schema for the quotes system
 */

import { neon } from "@neondatabase/serverless"

// Use the same database URL as the other systems
const sql = neon(process.env.DATABASE_URL || "postgresql://boozie_storage_owner:dR1Wwru3ZQoz@ep-late-glade-a54zppk1.us-east-2.aws.neon.tech/boozie_storage?sslmode=require")

console.log('🗄️  Setting up PostgreSQL quotes database schema...')

async function setupQuotesDatabase() {
    try {
        console.log('📋 Creating quotes table and indexes...')
        
        // 1. Create the quotes table
        await sql(`
          CREATE TABLE IF NOT EXISTS quotes (
            id SERIAL PRIMARY KEY,
            quote_text TEXT NOT NULL,
            quoted_by VARCHAR(255) NOT NULL,
            added_by VARCHAR(255) NOT NULL,
            added_by_id VARCHAR(50),
            date_said TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted BOOLEAN DEFAULT false
          )
        `)
        
        // 2. Create indexes
        await sql('CREATE INDEX IF NOT EXISTS idx_quotes_quoted_by ON quotes(quoted_by)')
        await sql('CREATE INDEX IF NOT EXISTS idx_quotes_added_by ON quotes(added_by)')
        await sql('CREATE INDEX IF NOT EXISTS idx_quotes_deleted ON quotes(deleted)')
        await sql('CREATE INDEX IF NOT EXISTS idx_quotes_date_said ON quotes(date_said)')
        
        // 3. Create trigger function for updated_at
        await sql(`
          CREATE OR REPLACE FUNCTION update_quotes_updated_at()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
          END;
          $$ language 'plpgsql'
        `)
        
        // 4. Create trigger
        await sql('DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes')
        await sql(`
          CREATE TRIGGER update_quotes_updated_at
              BEFORE UPDATE ON quotes
              FOR EACH ROW
              EXECUTE PROCEDURE update_quotes_updated_at()
        `)
        
        console.log('✅ Quotes database schema created successfully!')
        
        // Test the connection by checking if the table exists
        const tableCheck = await sql("SELECT table_name FROM information_schema.tables WHERE table_name = 'quotes'")
        
        if (tableCheck.length > 0) {
            console.log('✅ Quotes table confirmed in database')
            
            // Check current row count
            const rowCount = await sql('SELECT COUNT(*) as count FROM quotes')
            console.log(`📊 Current quotes: ${rowCount[0].count}`)
            
            // Add a sample quote
            console.log('📝 Adding sample quote...')
            
            await sql(`
              INSERT INTO quotes (quote_text, quoted_by, added_by, added_by_id)
              VALUES 
                ('Welcome to the quotes system!', 'BoozieBot', 'system', 'system')
              ON CONFLICT DO NOTHING
            `)
            
            console.log('✅ Sample quote added')
            
        } else {
            console.error('❌ Failed to create quotes table')
            process.exit(1)
        }
        
        console.log('\n🎉 Database setup complete!')
        console.log('ℹ️  Quotes system is ready to use')
        console.log('\nAvailable commands:')
        console.log('  !quote - Get a random quote')
        console.log('  !quote <id> - Get a specific quote')
        console.log('  !addquote <text> - Add a new quote (mod only)')
        console.log('  !delquote <id> - Delete a quote (mod only)')
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message)
        process.exit(1)
    }
}

// Run the setup
setupQuotesDatabase()