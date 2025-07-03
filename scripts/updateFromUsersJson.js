#!/usr/bin/env node

/**
 * Update egg values from users.json file (correct SE points)
 */

import { neon } from "@neondatabase/serverless"
import logger from '../utils/logger.js'
import dotenv from 'dotenv'
import fs from 'fs/promises'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })
const sql = neon(process.env.DATABASE_URL)

async function updateFromUsersJson() {
  try {
    logger.info('Loading users.json data...')
    const usersData = JSON.parse(await fs.readFile('/home/maddeth/bot/bot_js/users.json', 'utf-8'))
    
    logger.info('Starting updates...', { totalUsers: usersData.users.length })
    
    let updated = 0
    let created = 0
    let skipped = 0
    
    for (const user of usersData.users) {
      const username = user.username
      const points = user.points || 0
      
      // Skip users with no points or invalid usernames
      if (points <= 0 || !username || username.trim() === '') {
        skipped++
        continue
      }

      const usernameSanitised = username.toLowerCase()
      
      try {
        // Check if user exists
        const existingUser = await sql(
          'SELECT id FROM eggs WHERE LOWER(username_sanitised) = LOWER($1)',
          [usernameSanitised]
        )
        
        if (existingUser.length > 0) {
          // Update existing user
          await sql(
            'UPDATE eggs SET eggs_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [points, existingUser[0].id]
          )
          updated++
        } else {
          // Create new user
          await sql(
            'INSERT INTO eggs (username, username_sanitised, eggs_amount) VALUES ($1, $2, $3)',
            [username, usernameSanitised, points]
          )
          created++
        }
        
        if ((updated + created) % 100 === 0) {
          logger.info('Progress update', { updated, created, skipped })
        }
        
      } catch (error) {
        logger.error('Failed to process user', { username, error: error.message })
      }
    }
    
    console.log('\n=== UPDATE COMPLETE ===')
    console.log(`Users updated: ${updated}`)
    console.log(`Users created: ${created}`)
    console.log(`Users skipped: ${skipped}`)
    
    // Show top 5 users after update
    console.log('\n=== TOP 5 USERS AFTER UPDATE ===')
    const topUsers = await sql('SELECT username, eggs_amount FROM eggs ORDER BY eggs_amount DESC LIMIT 5')
    topUsers.forEach((user, i) => {
      console.log(`${i+1}. ${user.username}: ${user.eggs_amount.toLocaleString()} eggs`)
    })
    
  } catch (error) {
    logger.error('Update failed', { error: error.message })
    console.error('Update failed:', error.message)
    throw error
  }
}

updateFromUsersJson()
  .then(() => {
    console.log('\n✅ Update completed successfully!')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Update failed:', error.message)
    process.exit(1)
  })