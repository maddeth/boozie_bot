import logger from '../logger.js'
import { eggUpdateCommand } from './eggService.js'
import { changeColourEvent } from './colourService.js'

let twitchService = null

export function setTwitchService(service) {
  twitchService = service
}

export async function actionEventSub(eventTitle, eventUserContent, viewer, websocketService) {
  logger.info('Processing Twitch event', { eventTitle, viewer, userContent: eventUserContent?.substring(0, 50) })

  if (eventTitle === 'Convert Feed to 100 Eggs') {
    await eggUpdateCommand(viewer, 100, false)
    logger.info('Eggs conversion completed', { viewer, amount: 100 })
  } 
  else if (eventTitle === 'Convert Feed to 2000 Eggs') {
    await eggUpdateCommand(viewer, 2000, false)
    logger.info('Eggs conversion completed', { viewer, amount: 2000 })
  } 
  else if (eventTitle === 'Shadow Colour') {
    const redeem = {
      type: "redeem",
      id: "https://www.myinstants.com/media/sounds/unlimited-colors.mp3"
    }
    websocketService?.broadcast(redeem)
    await changeColourEvent(eventUserContent, viewer, twitchService?.sendChatMessage?.bind(twitchService))
    logger.info('Shadow colour redemption processed', { viewer, colour: eventUserContent })
  } 
  else if (eventTitle === 'Stress Less') {
    const redeem = {
      type: "redeem",
      id: "https://www.myinstants.com/media/sounds/shut-up-sit-down-relax-tommy-vercetti.mp3"
    }
    websocketService?.broadcast(redeem)
    logger.info('Stress less redemption processed', { viewer })
  } 
  else if (eventTitle === 'Stop Crouching') {
    const redeem = {
      type: "redeem",
      id: "https://www.myinstants.com/media/sounds/mgs-alert-sound.mp3"
    }
    websocketService?.broadcast(redeem)
    logger.info('Stop crouching redemption processed', { viewer })
  }
  else {
    logger.warn('Unknown event title', { eventTitle, viewer })
  }
}