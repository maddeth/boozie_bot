#!/usr/bin/env node

/**
 * Script to fix duplicate users and restore roles
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

async function fixDuplicates() {
  console.log('=== FIXING DUPLICATES AND ROLES ===\n')
  
  try {
    // Fix MuserGames
    console.log('Fixing MuserGames duplicates...')
    
    // Get both musergames entries
    const musergamesEntries = await sql("SELECT * FROM users WHERE LOWER(username) = 'musergames' ORDER BY created_at")
    
    if (musergamesEntries.length > 1) {
      const [first, second] = musergamesEntries
      console.log(`Found ${musergamesEntries.length} MuserGames entries`)
      
      // Keep the one with Supabase ID, merge data from the other
      const keepEntry = first.supabase_user_id ? first : second
      const deleteEntry = first.supabase_user_id ? second : first
      
      console.log(`Keeping: ${keepEntry.twitch_user_id} (has Supabase: ${!!keepEntry.supabase_user_id})`)
      console.log(`Deleting: ${deleteEntry.twitch_user_id}`)
      
      // Update the keeper with the most recent activity and restore bot admin role
      const mostRecentLastSeen = new Date(Math.max(
        new Date(keepEntry.last_seen).getTime(),
        new Date(deleteEntry.last_seen).getTime()
      ))
      
      await sql(`
        UPDATE users 
        SET 
          last_seen = $1,
          display_name = $2,
          is_admin = true,
          is_moderator = true
        WHERE id = $3
      `, [mostRecentLastSeen, 'MuserGames', keepEntry.id])
      
      // Delete the duplicate
      await sql('DELETE FROM users WHERE id = $1', [deleteEntry.id])
      
      console.log('✓ MuserGames fixed - merged duplicates and restored bot admin role')
    }
    
    // Fix ramanix - just restore bot admin role
    console.log('\nFixing ramanix roles...')
    const ramanixUpdate = await sql(`
      UPDATE users 
      SET is_admin = true 
      WHERE LOWER(username) = 'ramanix'
      RETURNING username, is_admin
    `)
    
    if (ramanixUpdate.length > 0) {
      console.log('✓ Ramanix bot admin role restored')
    }
    
    // Check for other duplicates and fix
    console.log('\nChecking for other duplicates...')
    const maddethEntries = await sql("SELECT * FROM users WHERE LOWER(username) = 'maddeth' ORDER BY created_at")
    
    if (maddethEntries.length > 1) {
      console.log(`Found ${maddethEntries.length} maddeth entries`)
      
      // Keep the one with most roles/Supabase ID
      const keepEntry = maddethEntries.find(e => e.is_superadmin) || maddethEntries[0]
      const deleteEntries = maddethEntries.filter(e => e.id !== keepEntry.id)
      
      for (const deleteEntry of deleteEntries) {
        console.log(`Deleting duplicate maddeth: ${deleteEntry.twitch_user_id}`)
        await sql('DELETE FROM users WHERE id = $1', [deleteEntry.id])
      }
      
      console.log('✓ Maddeth duplicates cleaned up')
    }
    
    // Show final state
    console.log('\n=== FINAL STATE ===')
    const finalUsers = await sql(`
      SELECT username, display_name, is_moderator, is_admin, is_superadmin, supabase_user_id
      FROM users 
      WHERE is_admin = true OR is_superadmin = true OR is_moderator = true
      ORDER BY username
    `)
    
    finalUsers.forEach(user => {
      const roles = []
      if (user.is_superadmin) roles.push('SUPERADMIN')
      if (user.is_admin) roles.push('Bot Admin')
      if (user.is_moderator) roles.push('Moderator')
      const hasSupabase = user.supabase_user_id ? '(Registered)' : ''
      console.log(`  - ${user.username} (${user.display_name}): ${roles.join(', ')} ${hasSupabase}`)
    })
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

fixDuplicates().catch(console.error)