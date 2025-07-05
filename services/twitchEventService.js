import logger from '../utils/logger.js'
import { eggUpdateCommand } from './eggService.js'
import { changeColourEvent } from './colourService.js'
import { getAlert } from './alertService.js'

let twitchService = null

export function setTwitchService(service) {
  twitchService = service
}

export async function actionEventSub(eventTitle, eventUserContent, viewer, websocketService) {
  logger.info('Processing Twitch event', { eventTitle, viewer, userContent: eventUserContent?.substring?.(0, 50) || eventUserContent })

  // Handle Twitch native events (subs, follows, gifts)
  if (eventTitle === 'subscription') {
    const tier = eventUserContent.tier || '1000'
    const userId = eventUserContent.userId
    let eggReward = 100 // Base reward for Tier 1

    if (tier === '2000') eggReward = 200 // Tier 2
    else if (tier === '3000') eggReward = 300 // Tier 3

    await eggUpdateCommand(viewer, eggReward, true, twitchService?.sendChatMessage?.bind(twitchService), userId)
    twitchService?.sendChatMessage(`Thank you for subscribing ${viewer}! You've received ${eggReward} eggs! 🥚✨`)
    logger.info('Subscription egg reward given', { viewer, userId, tier, eggReward })

  } else if (eventTitle === 'resubscription') {
    const tier = eventUserContent.tier || '1000'
    const userId = eventUserContent.userId
    const cumulativeMonths = eventUserContent.cumulativeMonths || 1
    const streakMonths = eventUserContent.streakMonths || 0
    
    // Base reward same as new sub
    let eggReward = 100 // Base reward for Tier 1
    if (tier === '2000') eggReward = 200 // Tier 2
    else if (tier === '3000') eggReward = 300 // Tier 3
    
    // Bonus for loyalty (10 eggs per month subbed, max 500 bonus)
    const loyaltyBonus = Math.min(cumulativeMonths * 10, 500)
    const totalReward = eggReward + loyaltyBonus

    await eggUpdateCommand(viewer, totalReward, true, twitchService?.sendChatMessage?.bind(twitchService), userId)
    
    if (streakMonths > 0) {
      twitchService?.sendChatMessage(`${viewer} resubscribed for ${cumulativeMonths} months (${streakMonths} month streak)! You've received ${totalReward} eggs (${eggReward} base + ${loyaltyBonus} loyalty bonus)! 🥚🔥`)
    } else {
      twitchService?.sendChatMessage(`${viewer} resubscribed for ${cumulativeMonths} months! You've received ${totalReward} eggs (${eggReward} base + ${loyaltyBonus} loyalty bonus)! 🥚✨`)
    }
    
    logger.info('Re-subscription egg reward given', { 
      viewer, 
      userId, 
      tier, 
      baseReward: eggReward,
      loyaltyBonus,
      totalReward,
      cumulativeMonths,
      streakMonths
    })

  } else if (eventTitle === 'gift_subscription') {
    const tier = eventUserContent.tier || '1000'
    const total = eventUserContent.total || 1
    const recipient = eventUserContent.recipient
    const gifterId = eventUserContent.userId
    const recipientId = eventUserContent.recipientId

    // Reward for gifter
    let gifterReward = 100 * total // 100 eggs per gift
    if (tier === '2000') gifterReward = 200 * total // Tier 2
    else if (tier === '3000') gifterReward = 300 * total // Tier 3

    // Reward for recipient (if not anonymous)
    let recipientReward = 100 // Base reward for receiving gift
    if (tier === '2000') recipientReward = 200 // Tier 2
    else if (tier === '3000') recipientReward = 300 // Tier 3

    // Give eggs to gifter
    await eggUpdateCommand(viewer, gifterReward, true, twitchService?.sendChatMessage?.bind(twitchService), gifterId)

    // Give eggs to recipient if not anonymous
    if (recipient && recipient !== 'Anonymous' && recipientId) {
      await eggUpdateCommand(recipient, recipientReward, true, twitchService?.sendChatMessage?.bind(twitchService), recipientId)
      twitchService?.sendChatMessage(`${viewer} gifted ${total} sub(s)! ${viewer} got ${gifterReward} eggs, ${recipient} got ${recipientReward} eggs! 🎁🥚`)
    } else {
      twitchService?.sendChatMessage(`${viewer} gifted ${total} sub(s)! ${viewer} got ${gifterReward} eggs for their generosity! 🎁🥚`)
    }

    logger.info('Gift subscription egg rewards given', {
      gifter: viewer,
      recipient,
      tier,
      total,
      gifterReward,
      recipientReward
    })

  } else if (eventTitle === 'follow') {
    const userId = eventUserContent.userId
    const eggReward = 500 // Small reward for follows

    await eggUpdateCommand(viewer, eggReward, true, twitchService?.sendChatMessage?.bind(twitchService), userId)
    twitchService?.sendChatMessage(`Welcome ${viewer}! Thanks for following! You've received ${eggReward} eggs! 🥚💜`)
    logger.info('Follow egg reward given', { viewer, userId, eggReward })

  } else if (eventTitle === 'Convert Feed to 100 Eggs') {
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