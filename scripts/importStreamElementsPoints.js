#!/usr/bin/env node

/**
 * Stream Elements Points Import Script
 * Fetches current user points from Stream Elements and imports them to the bot's egg system
 */

import StreamElementsService from '../services/streamElementsService.js'
import { neon } from "@neondatabase/serverless"
import logger from '../utils/logger.js'
import dotenv from 'dotenv'
import config from '../config.json' with { type: "json" }
import fs from 'fs/promises'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })
const sql = neon(process.env.DATABASE_URL)

class StreamElementsImporter {
  constructor() {
    this.seService = new StreamElementsService(
      config.streamElements.channelId,
      config.streamElements.bearerToken
    )
    this.importStats = {
      totalFetched: 0,
      totalImported: 0,
      updated: 0,
      created: 0,
      errors: 0,
      skipped: 0
    }
  }

  /**
   * Backup current egg data before importing
   */
  async backupCurrentData() {
    try {
      const currentData = await sql('SELECT * FROM eggs ORDER BY eggs_amount DESC')
      const backupFile = `/home/maddeth/bot/egg_backup_${Date.now()}.json`
      
      await fs.writeFile(backupFile, JSON.stringify(currentData, null, 2))
      logger.info('Current egg data backed up', { 
        file: backupFile, 
        recordCount: currentData.length 
      })
      
      return backupFile
    } catch (error) {
      logger.error('Failed to backup current egg data', { error: error.message })
      throw error
    }
  }

  /**
   * Fetch all users from Stream Elements with pagination
   */
  async fetchAllStreamElementsUsers() {
    const allUsers = []
    let offset = 0
    const limit = 1000
    let hasMore = true

    logger.info('Starting Stream Elements data fetch...')

    while (hasMore) {
      try {
        logger.info(`Fetching users ${offset + 1} to ${offset + limit}...`)
        const response = await this.seService.getAllUsers(limit, offset)
        
        if (response.users && response.users.length > 0) {
          allUsers.push(...response.users)
          this.importStats.totalFetched += response.users.length
          
          logger.info(`Fetched ${response.users.length} users (total: ${allUsers.length})`)
          
          // Check if there are more users to fetch
          if (response.users.length < limit || offset + limit >= response._total) {
            hasMore = false
          } else {
            offset += limit
          }
        } else {
          hasMore = false
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error) {
        logger.error('Error fetching Stream Elements users', { 
          offset, 
          error: error.message 
        })
        
        if (error.response?.status === 429) {
          logger.warn('Rate limited, waiting 5 seconds...')
          await new Promise(resolve => setTimeout(resolve, 5000))
          continue
        }
        
        throw error
      }
    }

    logger.info('Stream Elements data fetch completed', { 
      totalUsers: allUsers.length 
    })

    return allUsers
  }

  /**
   * Import or update a single user's egg data
   */
  async importUserEggs(seUser) {
    try {
      const username = seUser.username
      const points = seUser.points || 0
      
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
      logger.error('Failed to import user eggs', { 
        username: seUser.username, 
        points: seUser.points,
        error: error.message 
      })
      this.importStats.errors++
    }
  }

  /**
   * Process all Stream Elements users in batches
   */
  async importAllUsers(seUsers) {
    const batchSize = 50
    logger.info(`Starting import of ${seUsers.length} users in batches of ${batchSize}...`)
    
    for (let i = 0; i < seUsers.length; i += batchSize) {
      const batch = seUsers.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(seUsers.length / batchSize)
      
      logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} users)...`)
      
      const promises = batch.map(user => this.importUserEggs(user))
      await Promise.all(promises)
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /**
   * Save fetched Stream Elements data to JSON file for backup
   */
  async saveStreamElementsData(seUsers) {
    try {
      const outputFile = `/home/maddeth/bot/streamelements_export_${Date.now()}.json`
      await fs.writeFile(outputFile, JSON.stringify(seUsers, null, 2))
      logger.info('Stream Elements data saved', { 
        file: outputFile, 
        userCount: seUsers.length 
      })
      return outputFile
    } catch (error) {
      logger.error('Failed to save Stream Elements data', { error: error.message })
      throw error
    }
  }

  /**
   * Main import process
   */
  async run() {
    const startTime = Date.now()
    
    try {
      logger.info('=== Stream Elements Points Import Started ===')
      
      // Step 1: Backup current data
      logger.info('Step 1: Backing up current egg data...')
      const backupFile = await this.backupCurrentData()
      
      // Step 2: Fetch Stream Elements data
      logger.info('Step 2: Fetching Stream Elements user points...')
      const seUsers = await this.fetchAllStreamElementsUsers()
      
      // Step 3: Save SE data for reference
      logger.info('Step 3: Saving Stream Elements data backup...')
      const seBackupFile = await this.saveStreamElementsData(seUsers)
      
      // Step 4: Import to database
      logger.info('Step 4: Importing to egg database...')
      await this.importAllUsers(seUsers)
      
      const duration = (Date.now() - startTime) / 1000
      
      // Final report
      logger.info('=== Stream Elements Import Completed ===', {
        duration: `${duration}s`,
        stats: this.importStats,
        backupFile,
        seBackupFile
      })
      
      console.log('\n=== IMPORT SUMMARY ===')
      console.log(`Total Duration: ${duration}s`)
      console.log(`Users Fetched from SE: ${this.importStats.totalFetched}`)
      console.log(`Users Imported: ${this.importStats.totalImported}`)
      console.log(`  - Updated: ${this.importStats.updated}`)
      console.log(`  - Created: ${this.importStats.created}`)
      console.log(`  - Skipped: ${this.importStats.skipped}`)
      console.log(`  - Errors: ${this.importStats.errors}`)
      console.log(`Current Data Backup: ${backupFile}`)
      console.log(`SE Data Backup: ${seBackupFile}`)
      
      if (this.importStats.errors > 0) {
        console.log('\n⚠️  Some errors occurred during import. Check logs for details.')
      } else {
        console.log('\n✅ Import completed successfully!')
      }
      
    } catch (error) {
      logger.error('Stream Elements import failed', { error: error.message })
      console.error('\n❌ Import failed:', error.message)
      throw error
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const importer = new StreamElementsImporter()
  importer.run()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Import failed:', error.message)
      process.exit(1)
    })
}

export default StreamElementsImporter