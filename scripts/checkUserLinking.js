#!/usr/bin/env node

/**
 * Script to check user linking between Supabase and Twitch accounts
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

async function checkUserLinking() {
  console.log('=== CHECKING USER LINKING ===\n')
  
  try {
    // Check maddeth in users table
    console.log('1. Checking maddeth in users table:')
    const users = await sql("SELECT * FROM users WHERE LOWER(username) = 'maddeth'")
    
    if (users.length > 0) {
      const user = users[0]
      console.log(`✓ Found user in users table:`)
      console.log(`  - ID: ${user.id}`)
      console.log(`  - Twitch ID: ${user.twitch_user_id}`)
      console.log(`  - Username: ${user.username}`)
      console.log(`  - Display Name: ${user.display_name}`)
      console.log(`  - Supabase ID: ${user.supabase_user_id || 'NOT LINKED'}`)
      console.log(`  - Email: ${user.email || 'None'}`)
      console.log(`  - Roles: ${[
        user.is_superadmin && 'SUPERADMIN',
        user.is_admin && 'Admin', 
        user.is_moderator && 'Moderator'
      ].filter(Boolean).join(', ') || 'None'}`)
    } else {
      console.log('❌ No user found in users table')
    }
    
    console.log('\n2. Checking maddeth in eggs table:')
    const eggs = await sql("SELECT * FROM eggs WHERE LOWER(username) = 'maddeth' OR LOWER(username_sanitised) = 'maddeth'")
    
    if (eggs.length > 0) {
      eggs.forEach((egg, i) => {
        console.log(`✓ Found egg entry ${i + 1}:`)
        console.log(`  - ID: ${egg.id}`)
        console.log(`  - Username: ${egg.username}`)
        console.log(`  - Username Sanitised: ${egg.username_sanitised}`)
        console.log(`  - Twitch ID: ${egg.twitch_user_id || 'NOT SET'}`)
        console.log(`  - Eggs: ${egg.eggs_amount}`)
        console.log(`  - Created: ${egg.created_at}`)
        console.log(`  - Updated: ${egg.updated_at}`)
      })
    } else {
      console.log('❌ No eggs found for maddeth')
    }
    
    console.log('\n3. Checking for Supabase ID d23a469f-5d5c-4902-9740-6c9dac7e9330:')
    const supabaseUsers = await sql("SELECT * FROM users WHERE supabase_user_id = $1", ['d23a469f-5d5c-4902-9740-6c9dac7e9330'])
    
    if (supabaseUsers.length > 0) {
      console.log(`✓ Found user with this Supabase ID:`)
      const user = supabaseUsers[0]
      console.log(`  - Username: ${user.username}`)
      console.log(`  - Twitch ID: ${user.twitch_user_id}`)
      console.log(`  - Display Name: ${user.display_name}`)
    } else {
      console.log('❌ No user found with this Supabase ID')
    }
    
    console.log('\n=== DIAGNOSIS ===')
    if (users.length > 0 && eggs.length > 0) {
      const user = users[0]
      const egg = eggs[0]
      
      if (user.supabase_user_id) {
        console.log('✓ User has Supabase ID linked')
        console.log('✓ User exists in both tables')
        console.log('→ Issue might be in the API endpoint logic')
      } else {
        console.log('❌ User missing Supabase ID link')
        console.log('→ Need to link Supabase account to Twitch user')
        
        // Fix the linking
        console.log('\n🔧 FIXING USER LINKING...')
        await sql(`
          UPDATE users 
          SET supabase_user_id = $1 
          WHERE id = $2
        `, ['d23a469f-5d5c-4902-9740-6c9dac7e9330', user.id])
        
        console.log('✅ Linked Supabase ID to maddeth user')
      }
      
      if (egg.twitch_user_id !== user.twitch_user_id) {
        console.log('❌ Eggs table has different/missing Twitch ID')
        console.log('→ Need to update eggs table with correct Twitch ID')
        
        console.log('\n🔧 FIXING EGGS TWITCH ID...')
        await sql(`
          UPDATE eggs 
          SET twitch_user_id = $1 
          WHERE id = $2
        `, [user.twitch_user_id, egg.id])
        
        console.log('✅ Updated eggs table with correct Twitch ID')
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkUserLinking().catch(console.error)