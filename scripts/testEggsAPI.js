#!/usr/bin/env node

/**
 * Script to test the eggs API logic
 */

import { neon } from "@neondatabase/serverless"
import { getUserBySupabaseId } from '../services/userService.js'
import { getUserEggs } from '../services/eggServicePostgres.js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') })

const sql = neon(process.env.DATABASE_URL)

async function testEggsAPI() {
  console.log('=== TESTING EGGS API LOGIC ===\n')
  
  const supabaseUserId = 'd23a469f-5d5c-4902-9740-6c9dac7e9330'
  
  try {
    console.log('1. Testing getUserBySupabaseId function...')
    const user = await getUserBySupabaseId(supabaseUserId)
    
    if (user) {
      console.log('✅ getUserBySupabaseId returned:')
      console.log(`   - ID: ${user.id}`)
      console.log(`   - Username: ${user.username}`)
      console.log(`   - Twitch ID: ${user.twitch_user_id}`)
      console.log(`   - Display Name: ${user.display_name}`)
      console.log(`   - Supabase ID: ${user.supabase_user_id}`)
      
      console.log('\n2. Testing getUserEggs with Twitch ID...')
      const eggs = await getUserEggs(user.twitch_user_id)
      
      if (eggs) {
        console.log('✅ getUserEggs returned:')
        console.log(`   - Username: ${eggs.username}`)
        console.log(`   - Eggs: ${eggs.eggsAmount}`)
        console.log(`   - Twitch ID: ${eggs.twitchUserId}`)
      } else {
        console.log('❌ getUserEggs returned null')
      }
      
    } else {
      console.log('❌ getUserBySupabaseId returned null')
      
      // Check what's actually in the database
      console.log('\n🔍 Direct database check:')
      const dbCheck = await sql('SELECT * FROM users WHERE supabase_user_id = $1', [supabaseUserId])
      
      if (dbCheck.length > 0) {
        console.log('✅ User exists in database:')
        console.log(dbCheck[0])
      } else {
        console.log('❌ User not found in database')
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

testEggsAPI().catch(console.error)