#!/usr/bin/env node

/**
 * Script to check current chatters and moderator status
 */

import TwitchService from '../services/twitchService.js'
import { syncModerators } from '../services/moderatorSyncService.js'
import config from '../config.json' with { type: "json" }
import logger from '../utils/logger.js'

// Mock websocket service for TwitchService
const mockWebsocketService = {
  broadcast: () => {},
  sendToChannel: () => {}
}

async function checkChatters() {
  console.log('=== CHATTER AND MODERATOR CHECK ===\n')
  
  try {
    // Initialize TwitchService
    const twitchService = new TwitchService(mockWebsocketService)
    
    // Wait a moment for initialization
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check if stream is live
    const streamStatus = await twitchService.checkStreamStatus()
    console.log(`Stream status: ${streamStatus ? 'LIVE' : 'OFFLINE'}`)
    
    // Get current chatters
    const chatters = twitchService.getChatters()
    console.log(`\nCurrent chatters detected: ${chatters.size}`)
    
    if (chatters.size > 0) {
      console.log('Chatter list:')
      for (const [displayName, userId] of chatters) {
        console.log(`  - ${displayName} (ID: ${userId})`)
      }
    }
    
    // Check moderator status from Twitch API
    console.log('\nChecking moderators from Twitch API...')
    const modSyncResult = await syncModerators(twitchService, config.myChannelUserId)
    
    if (modSyncResult.success) {
      console.log(`✓ Moderator sync completed`)
      console.log(`  - Added: ${modSyncResult.added}`)
      console.log(`  - Removed: ${modSyncResult.removed}`)
      console.log(`  - Total Twitch mods: ${modSyncResult.totalTwitchMods}`)
    } else {
      console.log(`✗ Moderator sync failed: ${modSyncResult.error}`)
    }
    
    process.exit(0)
    
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

checkChatters().catch(console.error)