#!/usr/bin/env node

/**
 * Script to fix missing twitch_user_id for all eggs records
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

async function fixAllEggsTwitchIds() {
  console.log('=== FIXING ALL EGGS TWITCH IDS ===\n')
  
  try {
    // Get all eggs records without twitch_user_id
    console.log('1. Finding eggs records without twitch_user_id...')
    const eggsWithoutTwitchId = await sql(`
      SELECT * FROM eggs 
      WHERE twitch_user_id IS NULL OR twitch_user_id = ''
      ORDER BY eggs_amount DESC
    `)
    
    console.log(`Found ${eggsWithoutTwitchId.length} eggs records missing twitch_user_id\n`)
    
    if (eggsWithoutTwitchId.length === 0) {
      console.log('✅ All eggs records already have twitch_user_id!')
      return
    }
    
    let fixed = 0
    let notFound = 0
    
    // Process each eggs record
    for (const egg of eggsWithoutTwitchId) {
      try {
        // Try to find matching user by username
        const users = await sql(`
          SELECT twitch_user_id, username, display_name 
          FROM users 
          WHERE LOWER(username) = LOWER($1)
        `, [egg.username])
        
        if (users.length > 0) {
          const user = users[0]
          
          // Update eggs record with twitch_user_id
          await sql(`
            UPDATE eggs 
            SET twitch_user_id = $1 
            WHERE id = $2
          `, [user.twitch_user_id, egg.id])
          
          console.log(`✅ Fixed: ${egg.username} (${egg.eggs_amount} eggs) -> Twitch ID: ${user.twitch_user_id}`)
          fixed++
        } else {
          console.log(`❌ No user found for: ${egg.username} (${egg.eggs_amount} eggs)`)
          notFound++
        }
      } catch (error) {
        console.log(`❌ Error processing ${egg.username}: ${error.message}`)
        notFound++
      }
    }
    
    console.log(`\n=== SUMMARY ===`)
    console.log(`✅ Fixed: ${fixed} eggs records`)
    console.log(`❌ Not found: ${notFound} eggs records`)
    console.log(`📊 Total processed: ${eggsWithoutTwitchId.length}`)
    
    if (notFound > 0) {
      console.log(`\n⚠️  ${notFound} eggs records still need manual attention`)
      console.log('These users may need to:')
      console.log('1. Link their Twitch account by logging into the website')
      console.log('2. Have their username updated if they changed it on Twitch')
    }
    
    console.log('\n🔍 Verifying fix...')
    const remainingUnfixed = await sql(`
      SELECT COUNT(*) as count 
      FROM eggs 
      WHERE twitch_user_id IS NULL OR twitch_user_id = ''
    `)
    
    console.log(`Remaining unfixed eggs records: ${remainingUnfixed[0].count}`)
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

fixAllEggsTwitchIds().catch(console.error)