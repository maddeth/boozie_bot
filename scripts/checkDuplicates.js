#!/usr/bin/env node

/**
 * Script to check for duplicate users and role issues
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

async function checkDuplicates() {
  console.log('=== DUPLICATE ANALYSIS ===\n')
  
  try {
    // Check for musergames entries
    console.log('MuserGames entries:')
    const musergamesEntries = await sql("SELECT * FROM users WHERE LOWER(username) LIKE '%musergames%' OR LOWER(display_name) LIKE '%musergames%' ORDER BY created_at")
    musergamesEntries.forEach((user, i) => {
      const roles = []
      if (user.is_superadmin) roles.push('SUPERADMIN')
      if (user.is_admin) roles.push('Bot Admin')
      if (user.is_moderator) roles.push('Moderator')
      console.log(`  ${i+1}. Username: "${user.username}", Display: "${user.display_name}"`)
      console.log(`     Twitch ID: ${user.twitch_user_id}`)
      console.log(`     Supabase ID: ${user.supabase_user_id || 'null'}`)
      console.log(`     Roles: ${roles.join(', ') || 'None'}`)
      console.log(`     Created: ${user.created_at}`)
      console.log(`     Last seen: ${user.last_seen}`)
      console.log('')
    })
    
    // Check for ramanix entries
    console.log('Ramanix entries:')
    const ramanixEntries = await sql("SELECT * FROM users WHERE LOWER(username) LIKE '%ramanix%' OR LOWER(display_name) LIKE '%ramanix%' ORDER BY created_at")
    ramanixEntries.forEach((user, i) => {
      const roles = []
      if (user.is_superadmin) roles.push('SUPERADMIN')
      if (user.is_admin) roles.push('Bot Admin')
      if (user.is_moderator) roles.push('Moderator')
      console.log(`  ${i+1}. Username: "${user.username}", Display: "${user.display_name}"`)
      console.log(`     Twitch ID: ${user.twitch_user_id}`)
      console.log(`     Supabase ID: ${user.supabase_user_id || 'null'}`)
      console.log(`     Roles: ${roles.join(', ') || 'None'}`)
      console.log(`     Created: ${user.created_at}`)
      console.log(`     Last seen: ${user.last_seen}`)
      console.log('')
    })
    
    // Check for potential duplicates by username similarity
    console.log('Potential duplicates (similar usernames):')
    const allUsers = await sql('SELECT username, display_name, twitch_user_id, created_at FROM users ORDER BY username')
    const seen = new Set()
    allUsers.forEach(user => {
      const lowerUsername = user.username.toLowerCase()
      if (seen.has(lowerUsername)) {
        console.log(`  ⚠️  Potential duplicate: ${user.username} / ${user.display_name}`)
      }
      seen.add(lowerUsername)
    })
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkDuplicates().catch(console.error)