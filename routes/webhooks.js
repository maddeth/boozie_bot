import express from 'express'
import https from 'https'
import crypto from 'crypto'
import logger from '../utils/logger.js'
import config from '../config.json' with { type: "json" }
import { actionEventSub } from '../services/twitchEventService.js'

let websocketService = null

export function setWebSocketService(ws) {
  websocketService = ws
}

const router = express.Router()

const clientId = config.clientId
const bearerToken = config.bearer
const secret = config.secret
const myUrl = config.webAddress

function verifySignature(messageSignature, messageID, messageTimestamp, body) {
  let message = messageID + messageTimestamp + body
  let signature = crypto.createHmac('sha256', secret).update(message)
  let expectedSignatureHeader = "sha256=" + signature.digest("hex")

  return expectedSignatureHeader === messageSignature
}

function readTwitchEventSub(subBody, res) {
  if (subBody.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
    subBody.send(subBody.body.challenge)
  } else {
    processEventSub(subBody, res)
  }
}

function processEventSub(event, res) {
  if (event.header("Twitch-Eventsub-Message-Type") === "notification") {
    let eventType = event.body.subscription.type
    let eventData = event.body.event
    
    // Handle different event types
    if (eventType === "channel.channel_points_custom_reward_redemption.add") {
      // Channel points redemption
      let newEvent = eventData.reward.title
      let userInput = String(eventData.user_input)
      let viewerName = eventData.user_name
      logger.info('Channel point redemption', { 
        viewer: viewerName, 
        eventType, 
        rewardTitle: newEvent,
        userInput 
      })
      
      actionEventSub(newEvent, userInput, viewerName, websocketService)
      
    } else if (eventType === "channel.subscribe") {
      // New subscription
      let viewerName = eventData.user_name
      let viewerId = eventData.user_id
      let tier = eventData.tier
      logger.info('New subscription', { 
        viewer: viewerName,
        viewerId,
        tier,
        eventType 
      })
      
      actionEventSub("subscription", { tier, userId: viewerId }, viewerName, websocketService)
      
    } else if (eventType === "channel.subscription.message") {
      // Re-subscription with message
      let viewerName = eventData.user_name
      let viewerId = eventData.user_id
      let tier = eventData.tier
      let cumulativeMonths = eventData.cumulative_months
      let streakMonths = eventData.streak_months
      let message = eventData.message?.text
      
      logger.info('Re-subscription', { 
        viewer: viewerName,
        viewerId,
        tier,
        cumulativeMonths,
        streakMonths,
        eventType 
      })
      
      actionEventSub("resubscription", { 
        tier, 
        userId: viewerId, 
        cumulativeMonths, 
        streakMonths, 
        message 
      }, viewerName, websocketService)
      
    } else if (eventType === "channel.subscription.gift") {
      // Gift subscription
      let gifterName = eventData.user_name
      let gifterId = eventData.user_id
      let recipientName = eventData.is_anonymous ? "Anonymous" : eventData.user_name
      let recipientId = eventData.is_anonymous ? null : eventData.user_id
      let tier = eventData.tier
      let total = eventData.total || 1
      logger.info('Gift subscription', { 
        gifter: gifterName,
        gifterId,
        recipient: recipientName,
        recipientId,
        tier,
        total,
        eventType 
      })
      
      actionEventSub("gift_subscription", { tier, total, recipient: recipientName, userId: gifterId, recipientId }, gifterName, websocketService)
      
    } else if (eventType === "channel.follow") {
      // New follow
      let viewerName = eventData.user_name
      let viewerId = eventData.user_id
      logger.info('New follow', { 
        viewer: viewerName,
        viewerId,
        eventType 
      })
      
      actionEventSub("follow", { userId: viewerId }, viewerName, websocketService)
      
    } else {
      logger.warn('Unknown EventSub type', { eventType, eventData })
    }
    
    res.send("")
  }
}

// Helper function to create webhook subscription
function createWebhookSubscription(eventType, broadcasterId, callback) {
  return new Promise((resolve, reject) => {
    let createWebHookParams = {
      host: "api.twitch.tv",
      path: "helix/eventsub/subscriptions",
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Client-ID": clientId,
        "Authorization": bearerToken
      }
    }

    let createWebHookBody = {
      "type": eventType,
      "version": "1",
      "condition": {
        "broadcaster_user_id": broadcasterId
      },
      "transport": {
        "method": "webhook",
        "callback": myUrl + "/notification",
        "secret": secret
      }
    }

    let responseData = ""
    let webhookReq = https.request(createWebHookParams, (result) => {
      result.setEncoding('utf8')
      result.on('data', function (d) {
        responseData = responseData + d
      })
        .on('end', function (result) {
          let responseBody = JSON.parse(responseData)
          resolve(responseBody)
        })
    })
    webhookReq.on('error', (e) => { 
      logger.error('Webhook request failed', { eventType, error: e })
      reject(e)
    })
    webhookReq.write(JSON.stringify(createWebHookBody))
    webhookReq.end()
  })
}

router.post('/createWebhook/:broadcasterId', async (req, res) => {
  try {
    const broadcasterId = req.params.broadcasterId
    const results = []

    // Create webhooks for all event types
    const eventTypes = [
      "channel.channel_points_custom_reward_redemption.add",
      "channel.subscribe",
      "channel.subscription.message",  // Re-subscriptions
      "channel.subscription.gift", 
      "channel.follow"
    ]

    logger.info('Creating webhooks for all event types', { broadcasterId, eventTypes })

    for (const eventType of eventTypes) {
      try {
        const result = await createWebhookSubscription(eventType, broadcasterId)
        results.push({ eventType, success: true, data: result })
        logger.info('Webhook created successfully', { eventType, broadcasterId })
      } catch (error) {
        results.push({ eventType, success: false, error: error.message })
        logger.error('Failed to create webhook', { eventType, broadcasterId, error })
      }
    }

    res.json({
      broadcasterId,
      results,
      summary: {
        total: eventTypes.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    })

  } catch (error) {
    logger.error('Error creating webhooks', { error })
    res.status(500).json({ error: 'Failed to create webhooks' })
  }
})

// Legacy endpoint for backwards compatibility
router.post('/createChannelPointsWebhook/:broadcasterId', async (req, res) => {
  try {
    const result = await createWebhookSubscription(
      "channel.channel_points_custom_reward_redemption.add", 
      req.params.broadcasterId
    )
    res.json(result)
  } catch (error) {
    logger.error('Failed to create channel points webhook', error)
    res.status(500).json({ error: 'Failed to create webhook' })
  }
})

router.post('/notification', (req, res) => {
  if (!verifySignature(req.header("Twitch-Eventsub-Message-Signature"),
    req.header("Twitch-Eventsub-Message-Id"),
    req.header("Twitch-Eventsub-Message-Timestamp"),
    req.rawBody)) {
    res.status(403).send("Forbidden")
  } else {
    readTwitchEventSub(req, res)
  }
})

export default router