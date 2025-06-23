import crypto from 'crypto'
import { getHexByColourName, getColourByHex, getRandomColourByName } from '../colours2.js'
import OBSService from './obsService.js'
import { eggUpdateCommand } from './eggService.js'
import logger from '../logger.js'

const obsService = new OBSService()

export async function changeColourEvent(eventUserContent, viewer, sendChatMessage = null) {
  let colourString = eventUserContent.replace(/#/g, '').toLowerCase()
  let regex = /[0-9A-Fa-f]{6}/g

  let findHexInDB = await getHexByColourName(colourString)

  // Handle random colour requests
  if (colourString.trim().startsWith("random")) {
    let requestedRandomColour = colourString.replace("random", '').trim()
    let randomColour = await getRandomColourByName(requestedRandomColour)
    if (randomColour) {
      let randomColourHex = await getHexByColourName(randomColour)
      if (randomColourHex) {
        if (sendChatMessage) {
          sendChatMessage("Your Random Colour is " + randomColour)
          sendChatMessage("!addeggs " + viewer + " 4")
        }
        await eggUpdateCommand(viewer, 4, false)
        await obsService.changeColour(randomColourHex[0].hex_value)
        logger.info('Random colour applied', { viewer, colour: randomColour, hex: randomColourHex[0].hex_value })
        return
      } else {
        logger.warn('Failed to generate random colour', { requestedColour: requestedRandomColour })
      }
    }
  }

  // Handle "or" selection (e.g., "red or blue")
  if (colourString.trim().includes(" or ")) {
    let colourStringArray = colourString.split(' or ').join(',').split(',')
    let selectRandomColour = colourStringArray[Math.floor(Math.random() * colourStringArray.length)]
    let selectedColour = await getHexByColourName(selectRandomColour.trim())
    if (selectedColour.length > 0) {
      if (sendChatMessage) {
        sendChatMessage("Your Selected Colour is " + selectRandomColour)
        sendChatMessage("!addeggs " + viewer + " 4")
      }
      await eggUpdateCommand(viewer, 4, false)
      await obsService.changeColour(selectedColour[0].hex_value)
      logger.info('Selected colour from options', { viewer, colour: selectRandomColour, options: colourStringArray })
      return
    } else {
      logger.warn('Failed to select random colour from options', { options: colourStringArray })
    }
  }

  // Handle direct hex input
  if (colourString.match(regex)) {
    let colourName = await getColourByHex(colourString.toUpperCase())
    logger.debug('Hex colour lookup', { hex: colourString, foundColours: colourName })
    await obsService.changeColour(colourString)
    if (colourName.length > 0) {
      let colours = colourName.map(colour => colour.colourname).join(', ')
      if (sendChatMessage) {
        sendChatMessage("According to my list, that colour is " + colours)
      }
    }
    if (sendChatMessage) {
      sendChatMessage("!addeggs " + viewer + " 4")
    }
    await eggUpdateCommand(viewer, 4, false)
    logger.info('Hex colour applied', { viewer, hex: colourString, foundNames: colourName })
    return
  }
  // Handle named colour from database
  else if (findHexInDB.length > 0) {
    if (sendChatMessage) {
      sendChatMessage("That colour is on my list! Congratulations, Here are 4 eggs!")
      sendChatMessage("!addeggs " + viewer + " 4")
    }
    await eggUpdateCommand(viewer, 4, false)
    await obsService.changeColour(findHexInDB[0].hex_value)
    logger.info('Named colour applied from database', { viewer, colour: colourString, hex: findHexInDB[0].hex_value })
  } else {
    // Fallback to random colour
    let randomString = crypto.randomBytes(8).toString("hex").substring(0, 6)
    let randoColour = await getColourByHex(randomString)
    logger.info('Generated random colour fallback', { hex: randomString, foundColours: randoColour })
    if (sendChatMessage) {
      sendChatMessage("That colour isn't in my list. You missed out on eggs Sadge here is a random colour instead: " + (randoColour.length > 0 ? "Hex: " + randomString + " Colours: " + randoColour : randomString))
    }
    await obsService.changeColour(randomString)
    logger.info('Random fallback colour applied', { viewer, requestedColour: colourString, appliedHex: randomString })
  }
}