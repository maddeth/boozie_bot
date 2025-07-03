#!/usr/bin/env node
import { neon } from "@neondatabase/serverless"
import dotenv from 'dotenv'
import { up } from './migrations/add-egg-cost-to-commands.js'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })

const sql = neon(process.env.DATABASE_URL)

console.log('Running migration: add-egg-cost-to-commands...')

try {
  // Create a mock pool object that uses the neon sql function
  const mockPool = {
    query: async (query, params = []) => {
      if (params.length > 0) {
        return await sql(query, params)
      } else {
        return await sql(query)
      }
    }
  }
  
  await up(mockPool)
  console.log('Migration completed successfully!')
  process.exit(0)
} catch (error) {
  console.error('Migration failed:', error)
  process.exit(1)
}