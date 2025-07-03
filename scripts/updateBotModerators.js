#!/usr/bin/env node

/**
 * Script to update bot moderator status (admin privileges) for specific users
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

const botModerators = ['maddeth', 'musergames', 'ramanix']

async function updateBotModerators() {
  console.log('Updating bot moderator (admin) status...')
  
  for (const username of botModerators) {
    try {
      const result = await sql(
        `UPDATE users 
         SET is_admin = true 
         WHERE LOWER(username) = LOWER($1)
         RETURNING username, is_admin, is_moderator`,
        [username]
      )
      
      if (result.length > 0) {
        console.log(`✓ Updated ${username} - Admin: ${result[0].is_admin}, Moderator: ${result[0].is_moderator}`)
      } else {
        console.log(`✗ User ${username} not found in database`)
      }
    } catch (error) {
      console.error(`✗ Error updating ${username}:`, error.message)
    }
  }
  
  // Show all admins
  console.log('\nCurrent bot admins:')
  const admins = await sql('SELECT username, is_moderator, is_admin FROM users WHERE is_admin = true')
  admins.forEach(admin => {
    console.log(`  - ${admin.username} (Moderator: ${admin.is_moderator}, Admin: ${admin.is_admin})`)
  })
}

updateBotModerators().catch(console.error)