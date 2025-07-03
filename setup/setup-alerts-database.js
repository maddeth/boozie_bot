#!/usr/bin/env node

import { createAlertsTable } from './services/database/createAlertsTable.js'
import logger from '../utils/logger.js'

async function setupAlertsDatabase() {
  console.log('🎵 Alerts Database Setup')
  console.log('========================')
  
  try {
    await createAlertsTable()
    
    console.log('\n✅ Alerts database setup completed successfully!')
    console.log('\nThe following alert configs have been added:')
    console.log('- Shadow Colour')
    console.log('- Stress Less')
    console.log('- Stop Crouching')
    console.log('\nYou can now manage alerts through the API or web interface.')
    
  } catch (error) {
    console.error('❌ Alerts database setup failed:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAlertsDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Setup failed:', error)
      process.exit(1)
    })
}

export default setupAlertsDatabase