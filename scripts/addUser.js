#!/usr/bin/env node

/**
 * Script to manually add users to the database
 */

import { neon } from "@neondatabase/serverless"
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') })

const sql = neon(process.env.DATABASE_URL)

async function addUser(username, displayName = null, isAdmin = false) {
  try {
    console.log(`Adding user: ${username}...`)
    
    // Check if user already exists
    const existing = await sql(
      'SELECT username FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    )
    
    if (existing.length > 0) {
      console.log(`✓ User ${username} already exists`)
      
      // Update admin status if needed
      if (isAdmin) {
        await sql(
          'UPDATE users SET is_admin = true WHERE LOWER(username) = LOWER($1)',
          [username]
        )
        console.log(`✓ Updated ${username} to bot admin`)
      }
      return
    }
    
    // Create a placeholder Twitch user ID (we'll update this when they visit)
    const placeholderTwitchId = `placeholder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const result = await sql(
      `INSERT INTO users (
        twitch_user_id, username, display_name, is_admin, created_at, updated_at, last_seen
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING username, is_admin`,
      [placeholderTwitchId, username.toLowerCase(), displayName || username, isAdmin]
    )
    
    console.log(`✓ Added user ${username} ${isAdmin ? '(Bot Admin)' : ''}`)
    return result[0]
    
  } catch (error) {
    console.error(`✗ Error adding user ${username}:`, error.message)
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Usage: node addUser.js <username> [displayName] [--admin]')
    console.log('Example: node addUser.js musergames MuserGames --admin')
    process.exit(1)
  }
  
  const username = args[0]
  const displayName = args[1] && !args[1].startsWith('--') ? args[1] : null
  const isAdmin = args.includes('--admin')
  
  await addUser(username, displayName, isAdmin)
  
  // Show current admins
  console.log('\nCurrent bot admins:')
  const admins = await sql('SELECT username, is_moderator, is_admin, is_superadmin FROM users WHERE is_admin = true OR is_superadmin = true')
  admins.forEach(admin => {
    const roles = []
    if (admin.is_superadmin) roles.push('SUPERADMIN')
    if (admin.is_admin) roles.push('Bot Admin')
    if (admin.is_moderator) roles.push('Moderator')
    console.log(`  - ${admin.username}: ${roles.join(', ')}`)
  })
}

main().catch(console.error)