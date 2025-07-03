#!/usr/bin/env node

/**
 * Diagnostic script to check user and moderator status
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

async function diagnoseUsers() {
  console.log('=== USER DIAGNOSIS ===\n')
  
  try {
    // Check total users
    const totalUsers = await sql('SELECT COUNT(*) as count FROM users')
    console.log(`Total users in database: ${totalUsers[0].count}`)
    
    // Check users with placeholder IDs (manually created)
    const placeholderUsers = await sql("SELECT username, twitch_user_id FROM users WHERE twitch_user_id LIKE 'placeholder_%'")
    console.log(`\nUsers with placeholder IDs (manually created): ${placeholderUsers.length}`)
    placeholderUsers.forEach(user => {
      console.log(`  - ${user.username} (${user.twitch_user_id})`)
    })
    
    // Check moderators
    const moderators = await sql('SELECT username, is_moderator, is_admin, is_superadmin, twitch_user_id FROM users WHERE is_moderator = true OR is_admin = true OR is_superadmin = true')
    console.log(`\nUsers with special roles: ${moderators.length}`)
    moderators.forEach(user => {
      const roles = []
      if (user.is_superadmin) roles.push('SUPERADMIN')
      if (user.is_admin) roles.push('Bot Admin')
      if (user.is_moderator) roles.push('Moderator')
      console.log(`  - ${user.username}: ${roles.join(', ')} (ID: ${user.twitch_user_id})`)
    })
    
    // Check recent users (last 24 hours)
    const recentUsers = await sql("SELECT username, display_name, last_seen FROM users WHERE last_seen > NOW() - INTERVAL '24 hours' ORDER BY last_seen DESC")
    console.log(`\nUsers active in last 24 hours: ${recentUsers.length}`)
    recentUsers.slice(0, 10).forEach(user => {
      console.log(`  - ${user.username} (${user.display_name}) - ${user.last_seen}`)
    })
    
    // Check specific users
    const targetUsers = ['musergames', 'ramanix']
    console.log(`\nChecking specific users:`)
    
    for (const username of targetUsers) {
      const user = await sql('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username])
      if (user.length > 0) {
        const u = user[0]
        const roles = []
        if (u.is_superadmin) roles.push('SUPERADMIN')
        if (u.is_admin) roles.push('Bot Admin')
        if (u.is_moderator) roles.push('Moderator')
        console.log(`  ✓ ${u.username}: ${roles.join(', ') || 'No special roles'}`)
        console.log(`    - Twitch ID: ${u.twitch_user_id}`)
        console.log(`    - Last seen: ${u.last_seen}`)
        console.log(`    - Created: ${u.created_at}`)
      } else {
        console.log(`  ✗ ${username}: Not found in database`)
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

diagnoseUsers().catch(console.error)