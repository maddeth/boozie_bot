#!/usr/bin/env node

/**
 * Import from users.json file - this contains the correct current SE points
 */

import { neon } from "@neondatabase/serverless"
import logger from '../utils/logger.js'
import dotenv from 'dotenv'
import fs from 'fs/promises'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })
const sql = neon(process.env.DATABASE_URL)

class UsersJsonImporter {
  constructor() {
    this.importStats = {
      totalFromFile: 0,
      totalImported: 0,
      updated: 0,
      created: 0,
      errors: 0,
      skipped: 0
    }
  }

  /**
   * Restore from backup before importing correct data
   */
  async restoreBackup() {
    try {
      // Find the most recent backup
      const files = await fs.readdir('/home/maddeth/bot')
      const backupFiles = files.filter(f => f.startsWith('egg_backup_')).sort().reverse()
      
      if (backupFiles.length === 0) {
        throw new Error('No backup files found')
      }
      
      const latestBackup = `/home/maddeth/bot/${backupFiles[0]}`
      logger.info('Restoring from backup', { file: latestBackup })
      
      const backupData = JSON.parse(await fs.readFile(latestBackup, 'utf-8'))
      
      // Clear current data
      await sql('DELETE FROM eggs')
      
      // Restore backup data
      for (const user of backupData) {
        await sql(`
          INSERT INTO eggs (id, username, username_sanitised, twitch_user_id, eggs_amount, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          user.id,
          user.username,
          user.username_sanitised,
          user.twitch_user_id,
          user.eggs_amount,
          user.created_at,
          user.updated_at
        ])
      }
      
      logger.info('Backup restored successfully', { recordCount: backupData.length })
      
    } catch (error) {
      logger.error('Failed to restore backup', { error: error.message })
      throw error
    }
  }

  /**
   * Import from users.json file
   */
  async importFromUsersJson() {
    try {
      const usersData = JSON.parse(await fs.readFile('/home/maddeth/bot/users.json', 'utf-8'))
      
      this.importStats.totalFromFile = usersData.users.length
      logger.info('Loaded users.json data', { totalUsers: usersData.users.length })
      
      for (const user of usersData.users) {
        await this.importUser(user)
      }
      
    } catch (error) {
      logger.error('Failed to import from users.json', { error: error.message })
      throw error
    }
  }

  /**
   * Import a single user
   */
  async importUser(user) {
    try {
      const username = user.username
      const points = user.points || 0
      
      // Skip users with no points or invalid usernames
      if (points <= 0 || !username || username.trim() === '') {
        this.importStats.skipped++
        return
      }

      const usernameSanitised = username.toLowerCase()
      
      // Check if user already exists in eggs table
      const existingUser = await sql(
        'SELECT * FROM eggs WHERE LOWER(username_sanitised) = LOWER($1)',
        [usernameSanitised]
      )
      
      if (existingUser.length > 0) {
        // Update existing user
        await sql(
          `UPDATE eggs 
           SET eggs_amount = $1, 
               username = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [points, username, existingUser[0].id]
        )
        
        logger.debug('Updated existing user', { 
          username, 
          oldEggs: existingUser[0].eggs_amount,
          newEggs: points 
        })
        
        this.importStats.updated++
      } else {
        // Create new user
        await sql(
          `INSERT INTO eggs (username, username_sanitised, eggs_amount, twitch_user_id) 
           VALUES ($1, $2, $3, $4)`,
          [username, usernameSanitised, points, null] // twitch_user_id will be null initially
        )
        
        logger.debug('Created new user', { username, eggs: points })
        this.importStats.created++
      }
      
      this.importStats.totalImported++
      
    } catch (error) {
      logger.error('Failed to import user', { 
        username: user.username, 
        points: user.points,
        error: error.message 
      })
      this.importStats.errors++
    }
  }

  /**
   * Main import process
   */
  async run() {
    const startTime = Date.now()
    
    try {
      logger.info('=== users.json Import Started ===')
      
      // Step 1: Restore backup to get clean state
      logger.info('Step 1: Restoring from backup...')
      await this.restoreBackup()
      
      // Step 2: Import from users.json
      logger.info('Step 2: Importing from users.json...')
      await this.importFromUsersJson()
      
      const duration = (Date.now() - startTime) / 1000
      
      // Final report
      logger.info('=== users.json Import Completed ===', {
        duration: `${duration}s`,
        stats: this.importStats
      })
      
      console.log('\n=== IMPORT SUMMARY ===')
      console.log(`Total Duration: ${duration}s`)
      console.log(`Users in file: ${this.importStats.totalFromFile}`)
      console.log(`Users Imported: ${this.importStats.totalImported}`)
      console.log(`  - Updated: ${this.importStats.updated}`)
      console.log(`  - Created: ${this.importStats.created}`)
      console.log(`  - Skipped: ${this.importStats.skipped}`)
      console.log(`  - Errors: ${this.importStats.errors}`)
      
      if (this.importStats.errors > 0) {
        console.log('\n⚠️  Some errors occurred during import. Check logs for details.')
      } else {
        console.log('\n✅ Import completed successfully!')
      }
      
    } catch (error) {
      logger.error('users.json import failed', { error: error.message })
      console.error('\n❌ Import failed:', error.message)
      throw error
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const importer = new UsersJsonImporter()
  importer.run()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Import failed:', error.message)
      process.exit(1)
    })
}

export default UsersJsonImporter