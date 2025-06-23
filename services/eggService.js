import { dbGetEggs, dbAddEggUser, dbUpdateEggs } from '../eggs.js'
import logger from '../logger.js'

export async function eggUpdateCommand(userToUpdate, eggsToAdd, printToChat, sendChatMessage = null) {
  const getInfoByUser = await dbGetEggs(userToUpdate)
  
  if (getInfoByUser === undefined) {
    logger.info('Adding new egg user', { username: userToUpdate, initialEggs: eggsToAdd })
    await dbAddEggUser(userToUpdate, eggsToAdd)
    if (printToChat && sendChatMessage) {
      sendChatMessage("Updated " + userToUpdate + " with " + eggsToAdd + " eggs, they now have " + eggsToAdd)
    }
    return
  } else {
    var userEggValue = Number(getInfoByUser.eggsAmount) + Number(eggsToAdd)
    
    if (userEggValue < 0) {
      if (sendChatMessage) {
        sendChatMessage("you don't have enough eggs")
      }
      logger.warn('Insufficient eggs for transaction', { username: userToUpdate, currentEggs: getInfoByUser.eggsAmount, requestedChange: eggsToAdd })
      return
    } else {
      var userEggId = getInfoByUser.userId
      await dbUpdateEggs(userEggId, userEggValue)
      
      logger.info('Eggs updated', { 
        username: userToUpdate, 
        previousAmount: getInfoByUser.eggsAmount, 
        change: eggsToAdd, 
        newAmount: userEggValue 
      })

      if (printToChat && sendChatMessage) {
        if (eggsToAdd === 1) {
          sendChatMessage("Added " + eggsToAdd + " egg, " + userToUpdate + " now has " + userEggValue + " eggs")
        } else if (eggsToAdd > 2) {
          sendChatMessage("Added " + eggsToAdd + " eggs, " + userToUpdate + " now has " + userEggValue + " eggs")
        } else if (eggsToAdd === -1) {
          sendChatMessage("Removed " + Math.abs(eggsToAdd) + " egg, " + userToUpdate + " now has " + userEggValue + " eggs")
        } else if (eggsToAdd < 0) {
          sendChatMessage("Removed " + Math.abs(eggsToAdd) + " eggs, " + userToUpdate + " now has " + userEggValue + " eggs")
        } else {
          sendChatMessage("Why?")
        }
      }
      return
    }
  }
}