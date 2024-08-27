import bodyParser from 'body-parser'
import { ChatClient } from '@twurple/chat'
import crypto from 'crypto'
import express from 'express'
import https from 'https'
import OBSWebSocket from 'obs-websocket-js'
import { RefreshingAuthProvider } from '@twurple/auth'
import { promises as fs } from 'fs'
import { ApiClient } from '@twurple/api'
import fetch from 'node-fetch'
import { WebSocketServer } from 'ws'
import { dbAddColour, dbGetAllColoursCall, dbGetColourByHex, dbGetHex, dbGetColour, coloursRowCount, dbGetRandomColourByName } from './colours.js'
import { dbGetAllEggs, dbUpdateEggs, dbAddEggUser, dbGetEggs } from './eggs.js'
import { v4 as uuidv4 } from 'uuid'
import config from './config.json' with { type: "json" }
import findRemoveSync from 'find-remove'
import { subLookup } from './getSubs.js'

const boozieBotUserID = config.boozieBotUserID
const streamerID = config.myChannelUserId

// const tokenData = JSON.parse(await fs.readFile(`./tokens.${streamerID}.json`, 'UTF-8'))
const tokenData = JSON.parse(await fs.readFile(`./tokens.${boozieBotUserID}.json`, 'UTF-8'))
const modlist = JSON.parse(await fs.readFile('./modList.json', 'UTF-8'))

const clientId = config.clientId
const clientSecret = config.clientSecret
const bearerToken = config.bearer
const secret = config.secret
const obsPassword = config.obsPassword
const obsIP = config.obsIP
const myUrl = config.webAddress
const port = config.port
const webSocketPort = config.webSocketPort
const myChannel = config.myChannel
const eggUpdateInterval = config.eggUpdateInterval //in milliseconds 900000 seconds is 15 minutes
const connectedClients = {}
const wss = new WebSocketServer({ port: webSocketPort })
const authProvider = new RefreshingAuthProvider({ clientId, clientSecret })
const defaultEggs = 5

// authProvider.onRefresh(async (streamerID, newTokenData) => await fs.writeFile(`./tokens.${streamerID}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8'))
authProvider.onRefresh(async (boozieBotUserID, newTokenData) => await fs.writeFile(`./tokens.${boozieBotUserID}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8'))

await authProvider.addUserForToken(tokenData, ['chat'])
await authProvider.addUserForToken(tokenData, ['user:read:subscriptions'])

const chatClient = new ChatClient({ authProvider, channels: [myChannel] })
const api = new ApiClient({ authProvider })

chatClient.connect()

async function sendChatMessage(message) {
  chatClient.say(myChannel, message)
}

wss.on('connection', function connection(ws) {
  const clientId = uuidv4()
  connectedClients[clientId] = ws
  ws.on('message', function message(data) {
    console.log(clientId + ' %s', data)
  })
})

function isBotMod(modName) {
  return modlist.includes(modName)
}

const obs = new OBSWebSocket()
const app = express()

async function changeColourEvent(eventUserContent, viewer) {
  let colourString = eventUserContent.replace(/#/g, '').toLowerCase()
  let regex = /[0-9A-Fa-f]{6}/g
  let findHexInDB = await dbGetHex(colourString)
  if (colourString.trim().startsWith("random")) {
    let requestedRandomColour = colourString.replace("random", '').trim()
    let randomColour = await dbGetRandomColourByName(requestedRandomColour)
    if (randomColour) {
      let randomColourName = await dbGetColourByHex(randomColour)
      if (randomColourName) {
        sendChatMessage("Your Random Colour is " + randomColourName)
        sendChatMessage("!addeggs " + viewer + " 4")
        await changeColour(randomColour)
        return
      } else {
        console.log("Error: No random colour produced")
      }
    }
  }
  if (colourString.match(regex)) {
    let colourName = (await dbGetColourByHex(colourString))
    await changeColour(colourString)
    if (colourName) {
      sendChatMessage("According to my list, that colour is " + colourName)
    }
    sendChatMessage("!addeggs " + viewer + " 4")
  }
  else if (findHexInDB != null) {
    sendChatMessage("That colour is on my list! Congratulations, Here are 4 eggs!")
    sendChatMessage("!addeggs " + viewer + " 4")
    await changeColour(findHexInDB)
  } else {
    const randomString = crypto.randomBytes(8).toString("hex").substring(0, 6)
    let randoColour = await dbGetColourByHex(randomString)
    sendChatMessage("That colour isn't in my list. You missed out on eggs Sadge here is a random colour instead: " + (randoColour ? "Hex: " + randomString + " Colours: " + randoColour : randomString))
    await changeColour(randomString)
  }
}

async function changeColour(colour) {
  try {
    const {
      obsWebSocketVersion,
      negotiatedRpcVersion
    } = await obs.connect(obsIP, obsPassword, {
      rpcVersion: 1
    })
    console.log(`Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`)
  } catch (error) {
    console.error('Failed to connect', error.code, error.message)
  }

  const hexToDecimal = hex => parseInt(hex, 16)
  let arrayOfHex = colour.match(/.{1,2}/g)
  let obsHexOrder = arrayOfHex.reverse().join("")
  let finalHex = "ff" + obsHexOrder
  const obsDecimalColour = hexToDecimal(finalHex)

  let myObject = {
    color: obsDecimalColour
  }

  await obs.call('SetSourceFilterSettings', { sourceName: 'Webcam shadow', filterName: 'colour', filterSettings: myObject })
  await obs.call('SetSourceFilterSettings', { sourceName: 'Muse Shadow', filterName: 'colour', filterSettings: myObject })
  await obs.disconnect()
}

async function sendWebsocket(data) {
  for (const client in connectedClients) {
    if (connectedClients[client]) {
      connectedClients[client].send(JSON.stringify(data))
    }
  }
}

chatClient.onMessage(async (myChannel, user, message) => {
  await processMessage(user, message)
})

async function processMessage(user, message) {
  let unformattedMessage = message
  message = message.toLowerCase()
  if (message.startsWith("!colourlist") || message.startsWith("!colorlist") || message.startsWith("!colours")) {
    sendChatMessage(user + " - you can find the colour list here " + myUrl + "/colours")
    return
  }
  if (message.startsWith("!test")) {
    sendChatMessage(user + "icles")
    return
  }
  if (message.startsWith("!list")) {
    console.log(chatters)
    return
  }
  if (message.startsWith("!eggstest")) {
    if (isBotMod(user)) {
      var messageBody = unformattedMessage.slice(9)
      var command = unformattedMessage.slice(-9)
      var stringArray = messageBody.match(/-?[a-zA-Z0-9]+/g)
      stringArray = stringArray.filter(item => item.trim() !== '')

      if (stringArray.length != 2) {
        sendChatMessage("Incorrect arguements, please use " + command + " username numberOfEggs")
        return
      }
      if (typeof Number(stringArray[0]) === 'number' && isNaN(Number(stringArray[1]))) {
        sendChatMessage("Command in wrong format, please use " + command + " username numberOfEggs")
        return
      } else {
        let eggsToAdd = Number(stringArray[1])
        let userToUpdate = stringArray[0]
        await eggUpdateCommand(userToUpdate, eggsToAdd, true)
        return
      }
    }
    else {
      sendChatMessage("Get fucked " + user + ", you're not a mod cmonBruh")
      return
    }
  }
  if (message.startsWith("!tts")) {
    let toTts = message.slice(4)
    const ttsCreated = await runTTS(toTts)
    const tts = {
      type: "tts",
      id: ttsCreated,
    }
    await sendWebsocket(tts)
    return
  }

  //if (message.match(/(?:27[., ][5])/g)) {
  //  sendChatMessage("The reason I do 27.5 hour streams: I usually start my Friday stream at 7pm, and finish my Saturday stream at 10:30pm. So I start at my normal time on a Friday and finish at my normal time on a Saturday")
  //  return
  //}
}

async function eggUpdateCommand(userToUpdate, eggsToAdd, printToChat) {
  const getInfoByUser = await dbGetEggs(userToUpdate)
  // console.log(getInfoByUser)
  // const userEggMap = await dbGetEggs(userToUpdate.toLowerCase())
  // var getInfoByUser = userEggMap.find(item => item.NameLower === userToUpdate.toLowerCase())
  if (getInfoByUser === undefined) {
    console.log("User does not exist, add them")
    await dbAddEggUser(userToUpdate, eggsToAdd)
    printToChat ? sendChatMessage("Updated " + userToUpdate + " with " + eggsToAdd + " eggs, they now have " + eggsToAdd) : null
    // userEggMap = await dbGetAllEggs()
    return
  } else {
    // console.log(getInfoByUser.eggsAmount, eggsToAdd)
    var userEggValue = Number(getInfoByUser.eggsAmount) + Number(eggsToAdd)
    // console.log(userEggValue + " being added to " + userToUpdate)
    if (userEggValue < 0) {
      sendChatMessage("you don't have enough eggs")
      // userEggMap = await dbGetAllEggs()
      return
    } else {
      var userEggId = getInfoByUser.userId
      dbUpdateEggs(userEggId, userEggValue)
      if (eggsToAdd === 1) { //because someone will complain otherwise
        printToChat ? sendChatMessage("Added " + eggsToAdd + " egg, " + userToUpdate + " now has " + userEggValue + " eggs") : null
      } else if (eggsToAdd > 2) {
        printToChat ? sendChatMessage("Added " + eggsToAdd + " eggs, " + userToUpdate + " now has " + userEggValue + " eggs") : null
      } else if (eggsToAdd === -1) { //because someone complained
        printToChat ? sendChatMessage("Removed " + Math.abs(eggsToAdd) + " egg, " + userToUpdate + " now has " + userEggValue + " eggs") : null
      } else if (eggsToAdd < 0) {
        printToChat ? sendChatMessage("Removed " + Math.abs(eggsToAdd) + " eggs, " + userToUpdate + " now has " + userEggValue + " eggs") : null
      } else {
        printToChat ? sendChatMessage("Why?") : null
      }
      // userEggMap = await dbGetAllEggs()
      return
    }
  }
}

const chatters = await api.asUser(boozieBotUserID, async ctx => {
  const viewerList = new Map()
  const viewers = await ctx.chat.getChatters(streamerID)
  for (let viewerArray = 0; viewerArray < viewers.total; viewerArray++) {
    viewerList.set(viewers.data[viewerArray].userDisplayName, viewers.data[viewerArray].userId)
  }
  return viewerList
})

async function isStreamLive(streamer) {
  const checkStream = await api.streams.getStreamByUserId(streamer);
  if (checkStream != null) {
    return checkStream.type
  } else {
    return false
  }
}

if (await isStreamLive(streamerID)) {
  console.log("Stream online")
} else {
  console.log("Stream offline")
}

setInterval(async function () {
  const stream = await isStreamLive(streamerID)
  findRemoveSync('/home/html/tts', { age: { seconds: 300 }, extensions: '.mp3', })
  if (stream) {
    console.log("Stream online")
    let eggsToAdd = defaultEggs
    for (const [viewerName, viewerId] of chatters) {
      let checkSub = await subLookup(viewerName, viewerId)
      if (checkSub == 1) {
        eggsToAdd = defaultEggs * 2
        await eggUpdateCommand(viewerName, eggsToAdd, false)
      } else if (checkSub == 2) {
        eggsToAdd = defaultEggs * 3
        await eggUpdateCommand(viewerName, eggsToAdd, false)
      } else if (checkSub == 3) {
        eggsToAdd = defaultEggs * 4
        await eggUpdateCommand(viewerName, eggsToAdd, false)
      } else {
        eggsToAdd = defaultEggs
        await eggUpdateCommand(viewerName, eggsToAdd, false)
      }
    }
  } else {
    console.log("Stream offline")
  }
}, eggUpdateInterval)

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))

app.listen(port, () => {
  console.log(`Twitch Webhook listening at http://localhost:${port}`)
})

app.get('/', (req, res) => {
  res.redirect(301, 'https://www.twitch.tv/maddeth')
})

app.get('/add-colour', (req, res) => {
  res.sendFile("/home/html/form.html")
  res.status(200)
})

app.get('/my.css', (req, res) => {
  res.sendFile("/home/html/my.css")
  res.status(200)
})

app.get("/colours/:id", async (req, res, next) => {
  let result = await dbGetColour(req.params.id)
  res.status(200).json(result)
})

app.get("/colours", (req, res) => {
  res.sendFile("/home/html/colourlist.html")
  res.status(200)
})

app.get("/colour-list.json", async (req, res, next) => {
  let result = await dbGetAllColoursCall()
  res.status(200).json(JSON.parse(result))
})

app.get('/tts/:id', (req, res) => {
  let audioFilePath = `/home/html/tts/${req.params.id}.mp3`
  res.sendFile(audioFilePath)
})

// TODO: rewrite this
app.post("/colours/", async (req, res, next) => {
  let reqBody = req.body
  let regex = /[0-9A-Fa-f]{6}/g
  let newHex = reqBody.hex_code
  let newColour = String(reqBody.colour_name)
  console.log(newColour)
  if (newHex.match(regex)) {
    try {
      await dbAddColour(newColour, newHex)
      res.status(200).json({
        "colour_id": coloursRowCount
      })
    } catch (e) {
      res.status(400).json({
        "error": "Colour " + newColour + ", hex " + newHex + "not added"
      })
    }
  } else {
    console.log(`${newColour}:${newHex} was not added`)
    res.status(400).json({
      "error": "Colour " + newColour + ", hex " + newHex + "not added"
    })
  }
})

app.post('/createWebhook/:broadcasterId', (req, res) => {
  let createWebHookParams = {
    host: "api.twitch.tv",
    path: "helix/eventsub/subscriptions",
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Client-ID": clientId,
      "Authorization": bearerToken // Generate however you need to
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
  webhookReq.on('error', (e) => { console.log("Webhook Request Error:" + e) })
  webhookReq.write(JSON.stringify(createWebHookBody))
  webhookReq.end()
})

app.post('/notification', (req, res) => {
  if (!verifySignature(req.header("Twitch-Eventsub-Message-Signature"),
    req.header("Twitch-Eventsub-Message-Id"),
    req.header("Twitch-Eventsub-Message-Timestamp"),
    req.rawBody)) {
    res.status(403).send("Forbidden") // Reject requests with invalid signatures
  } else {
    readTwitchEventSub(req, res)
  }
})

function verifySignature(messageSignature, messageID, messageTimestamp, body) {
  let message = messageID + messageTimestamp + body
  let signature = crypto.createHmac('sha256', secret).update(message)
  let expectedSignatureHeader = "sha256=" + signature.digest("hex")

  return expectedSignatureHeader === messageSignature
}

function readTwitchEventSub(subBody, res) {
  if (subBody.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
    subBody.send(subBody.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
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
    console.log(viewerName + " " + eventType)
    console.log(viewerName + " redeemed " + "\"" + newEvent + "\"")
    res.send("") // Send a 200 status

    actionEventSub(newEvent, userInput, viewerName)
  }
}

//Event Sub actions
async function actionEventSub(eventTitle, eventUserContent, viewer) {
  if (eventTitle === 'Convert Feed to 100 Eggs') {
    sendChatMessage("!addeggs " + viewer + " 100")
    await eggUpdateCommand(viewer, 100, false)
  } else if (eventTitle === 'Convert Feed to 2000 Eggs') {
    sendChatMessage("!addeggs " + viewer + " 2000")
    await eggUpdateCommand(viewer, 2000, false)
  } else if (eventTitle === 'Shadow Colour') {
    const redeem = {
      type: "redeem",
      id: "redeem/unlimited-colours.mp3"
    }
    await sendWebsocket(redeem)
    changeColourEvent(eventUserContent, viewer)
  } else if (eventTitle === 'Stress Less') {
    const redeem = {
      type: "redeem",
      id: "redeem/stress-less.mp3"
    }
    await sendWebsocket(redeem)
  } else if (eventTitle === 'Stop Crouching') {
    const redeem = {
      type: "redeem",
      id: "redeem/mgs-alert-sound.mp3"
    }
    await sendWebsocket(redeem)
  }
}

const ttsStreamElementsHandler = async (text) => {
  try {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=Geraint&text=${encodeURI(text)}`
    const result = await fetch(url, { method: 'GET', })
    const buffer = await result.buffer()
    buffer.duration
    return buffer
  } catch (error) {
    console.error(error)
  }
  return null
}

async function getVoiceBuffer(text) {
  const buffer = await ttsStreamElementsHandler(text)
  return buffer
}

const runTTS = async (message) => {
  let currentMessage = message
  let buffer = Buffer.from([])

  if (currentMessage.length > 0) {
    const result = await getVoiceBuffer(currentMessage)
    if (result) {
      buffer = Buffer.concat([buffer, result])
    }
  }

  const id = uuidv4()
  fs.writeFile(`/home/html/tts/${id}.mp3`, buffer)
  return id
}
