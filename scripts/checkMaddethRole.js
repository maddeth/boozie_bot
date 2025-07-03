#!/usr/bin/env node

/**
 * Script to check and fix maddeth's roles
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

async function checkMaddethRole() {
  console.log('=== CHECKING MADDETH ROLES ===\n')
  
  try {
    // Check maddeth user
    console.log('Looking for maddeth user...')
    const maddethUsers = await sql("SELECT * FROM users WHERE LOWER(username) = 'maddeth'")
    
    if (maddethUsers.length === 0) {
      console.log('❌ No maddeth user found in database!')
      console.log('Creating maddeth user with superadmin privileges...')
      
      // Create maddeth user with superadmin
      await sql(`
        INSERT INTO users (twitch_user_id, username, display_name, is_superadmin, is_admin, is_moderator) 
        VALUES ('30758517', 'maddeth', 'Maddeth', true, true, true)
      `)
      console.log('✅ Created maddeth user with full privileges')
      
    } else {
      console.log(`Found ${maddethUsers.length} maddeth user(s):`)
      
      maddethUsers.forEach((user, i) => {
        const roles = []
        if (user.is_superadmin) roles.push('SUPERADMIN')
        if (user.is_admin) roles.push('Bot Admin')
        if (user.is_moderator) roles.push('Moderator')
        
        console.log(`  ${i+1}. ID: ${user.id}`)
        console.log(`     Twitch ID: ${user.twitch_user_id}`)
        console.log(`     Username: ${user.username}`)
        console.log(`     Display: ${user.display_name}`)
        console.log(`     Supabase ID: ${user.supabase_user_id || 'null'}`)
        console.log(`     Roles: ${roles.join(', ') || 'None'}`)
        console.log('')
      })
      
      // Update the first maddeth user to have all privileges
      const mainUser = maddethUsers[0]
      if (!mainUser.is_superadmin || !mainUser.is_admin || !mainUser.is_moderator) {
        console.log('Updating maddeth with full privileges...')
        await sql(`
          UPDATE users 
          SET is_superadmin = true, is_admin = true, is_moderator = true, display_name = 'Maddeth'
          WHERE id = $1
        `, [mainUser.id])
        console.log('✅ Updated maddeth with full privileges')
      } else {
        console.log('✅ Maddeth already has all privileges')
      }
    }
    
    // Check final state
    console.log('\n=== FINAL STATE ===')
    const finalMaddeth = await sql("SELECT * FROM users WHERE LOWER(username) = 'maddeth'")
    
    if (finalMaddeth.length > 0) {
      const user = finalMaddeth[0]
      const roles = []
      if (user.is_superadmin) roles.push('SUPERADMIN')
      if (user.is_admin) roles.push('Bot Admin')
      if (user.is_moderator) roles.push('Moderator')
      
      console.log(`✅ Maddeth (${user.display_name}): ${roles.join(', ')}`)
      console.log(`   Twitch ID: ${user.twitch_user_id}`)
      console.log(`   Supabase ID: ${user.supabase_user_id || 'Not linked'}`)
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkMaddethRole().catch(console.error)