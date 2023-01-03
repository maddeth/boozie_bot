import bodyParser from 'body-parser';
import { ChatClient } from '@twurple/chat';
import crypto from 'crypto';
import express from 'express';
import https from 'https';
import OBSWebSocket from 'obs-websocket-js';
import { RefreshingAuthProvider } from '@twurple/auth';
import { promises as fs } from 'fs';
//import mongoose from 'mongoose'; // leave this for when I add a database

const colours = JSON.parse(await fs.readFile('./colours', 'UTF-8'));

const clientId = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).clientId;
const clientSecret = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).clientSecret;
const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'UTF-8'));
const bearerToken = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).bearer;
const secret = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).secret;
const obsPassword = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).obsPassword;
const obsIP = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).obsIP;
const myUrl = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).webAddress;
const port = 3000;
const colourList = 'https://github.com/maddeth/boozie_bot/blob/main/colours';

const obs = new OBSWebSocket();
const app = express();

const authProvider = new RefreshingAuthProvider(
  {
    clientId,
    clientSecret,
    onRefresh: async newTokenData => await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
  },
  tokenData
);

const chatClient = new ChatClient({ authProvider, channels: ['maddeth'] });

chatClient.connect();

chatClient.onRegister(() => {
  console.log("connected")
});
  
function getHex(event) {
  let key = Object.keys(colours).find(k => k.toLowerCase().replace(/ /g, "").includes(event.toLowerCase().replace(/ /g,"")));
  let value = colours[key];
  console.log(value);  // Outputs: "value"

  return value;
}

function getColourName(event) {
  let keyColour = Object.entries(colours).find(([key, value]) => value === event);
  let outputColour = keyColour && keyColour.length > 0 ? keyColour[0] : null;
  console.log(outputColour);

  return outputColour;
}

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}));

app.post('/createWebhook/:broadcasterId', (req, res) => {
  var createWebHookParams = {
    host: "api.twitch.tv",
    path: "helix/eventsub/subscriptions",
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Client-ID": clientId,
      "Authorization": bearerToken // Generate however you need to
    }
  }

  var createWebHookBody = {
    "type": "channel.channel_points_custom_reward_redemption.add",
    "version": "1",
    "condition": {
      "broadcaster_user_id": req.params.broadcasterId
    },
    "transport": {
      "method": "webhook",
      "callback": myUrl+"/notification", // If you change the /notification path make sure to also adjust in line 114
      "secret": secret
    }
  }

  var responseData = ""
  var webhookReq = https.request(createWebHookParams, (result) => {
    result.setEncoding('utf8')
    result.on('data', function(d) {
      responseData = responseData + d
    })
    .on('end', function(result) {
      var responseBody = JSON.parse(responseData)
      res.send(responseBody)
    })
  })
  webhookReq.on('error', (e) => { console.log("Webhook Request Error:" + e) })
  webhookReq.write(JSON.stringify(createWebHookBody))
  webhookReq.end()
});

function verifySignature(messageSignature, messageID, messageTimestamp, body) {
  let message = messageID + messageTimestamp + body
  let signature = crypto.createHmac('sha256', secret).update(message)
  let expectedSignatureHeader = "sha256=" + signature.digest("hex")

  return expectedSignatureHeader === messageSignature
}

chatClient.onMessage((channel, user, message) => {
  if (message.startsWith("!")){
    let lowerCaseMessage = message.toLowerCase();
    sendMessage(channel, lowerCaseMessage, user)
  }
});

function sendMessage(channel, message, user) {
  if (message === "!colourlist" || message === "!colorlist" || message === "!colours") {
    chatClient.say(channel, user + " - you can find the colour list here " + colourList);
  } else {
    chatClient.say(channel, message)
  }
}

app.post('/notification', (req, res) => {
  if (!verifySignature(req.header("Twitch-Eventsub-Message-Signature"),
    req.header("Twitch-Eventsub-Message-Id"),
    req.header("Twitch-Eventsub-Message-Timestamp"),
    req.rawBody)) {
      res.status(403).send("Forbidden") // Reject requests with invalid signatures
  } else {
    readTwitchEventSub(req, res)
  }
});

function readTwitchEventSub(subBody, res) {
  if (subBody.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
    console.log(subBody.body.challenge)
    subBody.send(subBody.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
  } else {
    processEventSub(subBody, res)
  } 
}

function processEventSub(event, res) {
  if (event.header("Twitch-Eventsub-Message-Type") === "notification") {
    let newEvent = event.body.event.reward.title
    let userInput = event.body.event.user_input
    let viewerName = event.body.event.user_name
    let channel = event.body.event.broadcaster_user_login

    console.log(viewerName + " redeemed " + "\"" + newEvent + "\"")
    res.send("") // Send a 200 status

    actionEventSub(newEvent, userInput, viewerName, channel)
  }
}

function actionEventSub(eventTitle, eventUserContent, viewer, channel) {
  if(eventTitle === 'Convert Feed to 100 Eggs'){
    sendMessage(channel, "!addeggs " + viewer + " 100")
  } else if (eventTitle === 'Convert Feed to 2000 Eggs') {
    sendMessage(channel, "!addeggs " + viewer + " 2000");
  } else if (eventTitle === 'Sound Alert: Shadow colour') {
    changeColourEvent(eventUserContent, viewer, channel)
  }
}

function changeColourEvent(eventUserContent, viewer, channel) {
  var colourString = eventUserContent.replace(/#/g, '').toLowerCase()
  var regex = /[0-9A-Fa-f]{6}/g;
  if (colourString.match(regex)){
    changeColour(colourString)
    let colourName = getColourName(colourString);
    if (colourName) {
      sendMessage(channel, "According to my list, that colour is " + colourName);
    }
    sendMessage(channel, "!addeggs " + viewer + " 4");
  } else if (getHex(colourString)) {
    sendMessage(channel, "That colour is on my list! Congratulations, Here are 4 eggs!");
    sendMessage(channel, "!addeggs " + viewer + " 4");
    changeColour(getHex(colourString))
  } else {
    const randomString = crypto.randomBytes(8).toString("hex").substring(0, 6);
    let randoColour = getColourName(randomString);
    sendMessage(channel, "That colour isn't in my list. You missed out on eggs Sadge here is a random colour instead: " + (randoColour ? randoColour : randomString));
    changeColour(randomString)
  }
}

app.listen(port, () => {
  console.log(`Twitch Webhook listening at http://localhost:${port}`)
});

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + "/html/")
});

async function changeColour(colour) {
  try {
    const {
      obsWebSocketVersion,
      negotiatedRpcVersion
    } = await obs.connect(obsIP, obsPassword, {
      rpcVersion: 1
    });
    console.log(`Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`)
  } catch (error) {
    console.error('Failed to connect', error.code, error.message);
  }
  
  const hexToDecimal = hex => parseInt(hex, 16); 
  
  var arrayOfHex = colour.match(/.{1,2}/g)
  var obsHexOrder = arrayOfHex.reverse().join("")
  var finalHex = "ff" + obsHexOrder
  const obsDecimalColour = hexToDecimal(finalHex);

  var myObject = {
    color: obsDecimalColour
  }
  
  await obs.call('SetSourceFilterSettings',{sourceName: 'Webcam shadow', filterName: 'colour', filterSettings: myObject});
  await obs.disconnect();
}
