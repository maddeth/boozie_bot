#!/usr/bin/env node

/**
 * Script to add superadmin column to the database
 */

import { neon } from "@neondatabase/serverless"
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') })

const sql = neon(process.env.DATABASE_URL)

async function addSuperAdminColumn() {
  console.log('Adding superadmin column to database...\n')
  
  try {
    // Read the SQL file
    const sqlContent = readFileSync(join(__dirname, '../database/addSuperAdminColumn.sql'), 'utf8')
    
    // Execute the SQL commands
    const commands = sqlContent.split(';').filter(cmd => cmd.trim())
    
    for (const command of commands) {
      if (command.trim()) {
        console.log('Executing:', command.trim().substring(0, 50) + '...')
        const result = await sql(command)
        if (Array.isArray(result) && result.length > 0) {
          console.log('Result:', result)
        }
      }
    }
    
    console.log('\n✓ Superadmin column added successfully!')
    
    // Show current roles
    console.log('\nCurrent role hierarchy:')
    const users = await sql(`
      SELECT username, is_moderator, is_admin, is_superadmin 
      FROM users 
      WHERE is_superadmin = true OR is_admin = true OR is_moderator = true
      ORDER BY is_superadmin DESC, is_admin DESC, is_moderator DESC, username
    `)
    
    users.forEach(user => {
      const roles = []
      if (user.is_superadmin) roles.push('SUPERADMIN')
      if (user.is_admin) roles.push('Bot Admin')
      if (user.is_moderator) roles.push('Moderator')
      console.log(`  - ${user.username}: ${roles.join(', ')}`)
    })
    
  } catch (error) {
    console.error('✗ Error:', error.message)
    process.exit(1)
  }
}

addSuperAdminColumn().catch(console.error)