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
    let newEvent = event.body.event.reward.title
    let userInput = String(event.body.event.user_input)
    let viewerName = event.body.event.user_name
    logger.info('Channel point redemption', { 
      viewer: viewerName, 
      eventType, 
      rewardTitle: newEvent,
      userInput 
    })
    res.send("")

    actionEventSub(newEvent, userInput, viewerName, websocketService)
  }
}

router.post('/createWebhook/:broadcasterId', (req, res) => {
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
    "type": "channel.channel_points_custom_reward_redemption.add",
    "version": "1",
    "condition": {
      "broadcaster_user_id": req.params.broadcasterId
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
        res.send(responseBody)
      })
  })
  webhookReq.on('error', (e) => { logger.error('Webhook request failed', e) })
  webhookReq.write(JSON.stringify(createWebHookBody))
  webhookReq.end()
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