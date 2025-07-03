import logger from '../utils/logger.js'
import { eggUpdateCommand } from './eggService.js'
import { changeColourEvent } from './colourService.js'
import { getAlert } from './alertService.js'

let twitchService = null

export function setTwitchService(service) {
  twitchService = service
}

export async function actionEventSub(eventTitle, eventUserContent, viewer, websocketService) {
  logger.info('Processing Twitch event', { eventTitle, viewer, userContent: eventUserContent?.substring(0, 50) })

  if (eventTitle === 'Convert Feed to 100 Eggs') {
    await eggUpdateCommand(viewer, 100, true, twitchService?.sendChatMessage?.bind(twitchService))
    logger.info('Eggs conversion completed', { viewer, amount: 100 })
  } 
  else if (eventTitle === 'Convert Feed to 2000 Eggs') {
    await eggUpdateCommand(viewer, 2000, true, twitchService?.sendChatMessage?.bind(twitchService))
    logger.info('Eggs conversion completed', { viewer, amount: 2000 })
  } 
  else {
    // Check database for alert config
    const alert = await getAlert(eventTitle)
    
    if (alert) {
      // Handle alerts with audio and optional gif
      const redeem = {
        type: "redeem",
        id: alert.audio,
        ...(alert.gifUrl && { gifUrl: alert.gifUrl }),
        ...(alert.duration && { duration: alert.duration })
      }
      websocketService?.broadcast(redeem)
      
      // Special handling for Shadow Colour
      if (eventTitle === 'Shadow Colour') {
        await changeColourEvent(eventUserContent, viewer, twitchService?.sendChatMessage?.bind(twitchService))
        logger.info('Shadow colour redemption processed', { viewer, colour: eventUserContent })
      } else {
        logger.info(`${eventTitle} redemption processed`, { viewer })
      }
    } else {
      logger.warn('Unknown event title', { eventTitle, viewer })
    }
  }
}