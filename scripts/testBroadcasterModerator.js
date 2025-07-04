#!/usr/bin/env node

/**
 * Script to test broadcaster inclusion in moderator sync
 */

import { syncModerators } from '../services/moderatorSyncService.js'
import TwitchService from '../services/twitchService.js'
import WebSocketService from '../services/websocketService.js'
import config from '../config.json' with { type: "json" }
import logger from '../utils/logger.js'

async function testBroadcasterModerator() {
  console.log('=== TESTING BROADCASTER MODERATOR SYNC ===\n')
  
  try {
    // Initialize services (simplified for testing)
    console.log('Initializing Twitch service...')
    const websocketService = new WebSocketService(3001)
    const twitchService = new TwitchService(websocketService)
    
    // Wait for initialization
    await new Promise((resolve) => {
      const checkInit = setInterval(() => {
        if (twitchService.api) {
          clearInterval(checkInit)
          resolve()
        }
      }, 100)
    })
    
    console.log('✅ TwitchService initialized')
    
    // Run moderator sync
    console.log('Running moderator sync...')
    const result = await syncModerators(twitchService, config.myChannelUserId)
    
    if (result.success) {
      console.log('✅ Moderator sync completed:')
      console.log(`   - Total Twitch Mods: ${result.totalTwitchMods}`)
      console.log(`   - Added: ${result.added}`)
      console.log(`   - Removed: ${result.removed}`)
      console.log(`   - Updated: ${result.updated}`)
    } else {
      console.log('❌ Moderator sync failed:', result.error)
    }
    
    // Check if maddeth is now in the moderators list
    console.log('\nChecking if broadcaster is in moderators list...')
    const { getModerators } = await import('../services/userService.js')
    const moderators = await getModerators()
    
    const broadcasterMod = moderators.find(mod => mod.twitch_user_id === config.myChannelUserId)
    
    if (broadcasterMod) {
      console.log('✅ Broadcaster found in moderators:')
      console.log(`   - Username: ${broadcasterMod.username}`)
      console.log(`   - Display Name: ${broadcasterMod.display_name}`)
      console.log(`   - Is Moderator: ${broadcasterMod.is_moderator}`)
      console.log(`   - Is Superadmin: ${broadcasterMod.is_superadmin}`)
    } else {
      console.log('❌ Broadcaster not found in moderators list')
    }
    
    console.log('\nAll moderators:')
    moderators.forEach((mod, i) => {
      const badges = []
      if (mod.twitch_user_id === config.myChannelUserId) badges.push('BROADCASTER')
      if (mod.is_superadmin) badges.push('SUPERADMIN')
      if (mod.is_admin) badges.push('ADMIN')
      if (mod.is_moderator) badges.push('MODERATOR')
      
      console.log(`  ${i + 1}. ${mod.display_name || mod.username} (@${mod.username}) [${badges.join(', ')}]`)
    })
    
    // Cleanup
    await twitchService.disconnect()
    websocketService.close()
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testBroadcasterModerator().catch(console.error)