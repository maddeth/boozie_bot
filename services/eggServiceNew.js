/**
 * PostgreSQL-based Egg Service
 * Maintains the same interface as the original eggService but uses PostgreSQL instead of Azure
 * Drop-in replacement for the Azure Table Storage version
 */

import { getUserEggs, addEggUser, addEggsToUser } from './eggPostgresService.js'
import logger from '../utils/logger.js'

/**
 * Main egg update command - maintains exact same interface as original
 * @param {string} userToUpdate - Username to update
 * @param {number} eggsToAdd - Number of eggs to add (can be negative)
 * @param {boolean} printToChat - Whether to send chat message
 * @param {function} sendChatMessage - Optional chat message callback
 */
export async function eggUpdateCommand(userToUpdate, eggsToAdd, printToChat, sendChatMessage = null) {
  try {
    // Get current user info from PostgreSQL
    const getInfoByUser = await getUserEggs(userToUpdate)
    
    if (getInfoByUser === null) {
      // User doesn't exist - create new user
      logger.info('Adding new egg user', { 
        username: userToUpdate, 
        initialEggs: eggsToAdd 
      })
      
      const newUser = await addEggUser(userToUpdate, Math.max(0, eggsToAdd))
      
      if (printToChat && sendChatMessage && newUser) {
        sendChatMessage("Updated " + userToUpdate + " with " + Math.max(0, eggsToAdd) + " eggs, they now have " + Math.max(0, eggsToAdd))
      }
      return
      
    } else {
      // User exists - update their egg count
      const currentEggs = Number(getInfoByUser.eggs_amount)
      const newEggValue = currentEggs + Number(eggsToAdd)
      
      if (newEggValue < 0) {
        // Insufficient eggs
        if (sendChatMessage) {
          sendChatMessage("you don't have enough eggs")
        }
        logger.warn('Insufficient eggs for transaction', { 
          username: userToUpdate, 
          currentEggs: currentEggs, 
          requestedChange: eggsToAdd 
        })
        return
        
      } else {
        // Update the user's eggs
        const updatedUser = await addEggsToUser(userToUpdate, eggsToAdd)
        
        if (updatedUser) {
          logger.info('Eggs updated', { 
            username: userToUpdate, 
            previousAmount: currentEggs, 
            change: eggsToAdd, 
            newAmount: updatedUser.eggs_amount 
          })

          // Send chat message with same logic as original
          if (printToChat && sendChatMessage) {
            if (eggsToAdd === 1) {
              sendChatMessage("Added " + eggsToAdd + " egg, " + userToUpdate + " now has " + updatedUser.eggs_amount + " eggs")
            } else if (eggsToAdd > 1) {
              sendChatMessage("Added " + eggsToAdd + " eggs, " + userToUpdate + " now has " + updatedUser.eggs_amount + " eggs")
            } else if (eggsToAdd === -1) {
              sendChatMessage("Removed " + Math.abs(eggsToAdd) + " egg, " + userToUpdate + " now has " + updatedUser.eggs_amount + " eggs")
            } else if (eggsToAdd < 0) {
              sendChatMessage("Removed " + Math.abs(eggsToAdd) + " eggs, " + userToUpdate + " now has " + updatedUser.eggs_amount + " eggs")
            } else {
              sendChatMessage("Why?")
            }
          }
        } else {
          logger.error('Failed to update user eggs', { username: userToUpdate })
        }
        return
      }
    }
    
  } catch (error) {
    logger.error('Error in eggUpdateCommand', { 
      username: userToUpdate, 
      eggsToAdd, 
      error: error.message 
    })
    
    if (sendChatMessage) {
      sendChatMessage("Egg update failed - please try again")
    }
  }
}

/**
 * Get user's current egg count (helper function)
 * @param {string} username - Username to look up
 * @returns {number} - Current egg count or 0 if user doesn't exist
 */
export async function getUserEggCount(username) {
  try {
    const user = await getUserEggs(username)
    return user ? user.eggs_amount : 0
  } catch (error) {
    logger.error('Error getting user egg count', { username, error: error.message })
    return 0
  }
}

/**
 * Check if user has enough eggs for a transaction
 * @param {string} username - Username to check
 * @param {number} requiredEggs - Number of eggs required
 * @returns {boolean} - True if user has enough eggs
 */
export async function hasEnoughEggs(username, requiredEggs) {
  try {
    const currentEggs = await getUserEggCount(username)
    return currentEggs >= requiredEggs
  } catch (error) {
    logger.error('Error checking egg sufficiency', { username, requiredEggs, error: error.message })
    return false
  }
}