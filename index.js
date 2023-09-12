import bodyParser from 'body-parser';
import { ChatClient } from '@twurple/chat';
import crypto from 'crypto';
import express from 'express';
import https from 'https';
import OBSWebSocket from 'obs-websocket-js';
import { RefreshingAuthProvider } from '@twurple/auth';
import { promises as fs } from 'fs';
import { ApiClient } from '@twurple/api';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';
import { dbAddColour, dbGetAllColours, dbGetColourByHex, dbGetHex, dbGetColour, coloursRowCount } from './colours.js';

const clientId = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).clientId;
const clientSecret = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).clientSecret;
const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'UTF-8'));
const bearerToken = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).bearer;
const secret = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).secret;
const obsPassword = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).obsPassword;
const obsIP = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).obsIP;
const myUrl = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).webAddress;
const tokenDataMe = JSON.parse(await fs.readFile('./tokens_me.json', 'UTF-8'));
const modlist = JSON.parse(await fs.readFile('./modList.json', 'UTF-8'));
const port = 3000;
const webSocketPort = 3001;

// const azureTableEndpoint = "https://" + account + ".table.core.windows.net/";
// const azureTableCredential = new AzureNamedKeyCredential(account, accountKey);
// const colourTableName = "colours";
// const eggsTableName = "eggs";
//const eggsTableClient = new TableClient(azureTableEndpoint, eggsTableName, azureTableCredential);

const wss = new WebSocketServer({ port: webSocketPort });
const connectedClients = {};

wss.on('connection', function connection(ws) {
  const clientId = generateUniqueClientId();
  connectedClients[clientId] = ws;
  ws.on('message', function message(data) {
    console.log(clientId + ' %s', data);
  });
});

function generateUniqueClientId() {
  const id = Math.random().toString(36).substring(2, 15);
  return id;
}

function isBotMod(modName) {
  return modlist.includes(modName);
}

// let eggsRowCount = parseInt(await getRowCount(eggsTableClient), 10)


const obs = new OBSWebSocket();
const app = express();

async function getRowCount(tableClient) {
  let rowList = []
  let entities = tableClient.listEntities();
  for await (const entity of entities) {
    rowList.push(entity.RowKey)
  }
  return rowList.length
}

// async function dbGetAllEggs() {
//   let eggsMap = []
//   let eggsObject = {}
//   let i = 0
//   let entities = eggsTableClient.listEntities();
//   for await (const entity of entities) {
//     eggsObject = { Name: entity.userName, Eggs: entity.eggsAmount }
//     eggsMap.push(eggsObject)
//   }
//   return JSON.stringify(eggsMap)
// }

// async function dbAddUser(userName, eggs) {
//   const eggsSanitised = eggs
//   const partitionKey = "user";
//   const userNameSanitised = `${userName.replace(/\s/g, '').toLowerCase()}`
//   let row = usersRowCount + 1
//   console.log(`adding row ${row} and user: ${userNameSanitised}/${eggsSanitised}`)
//   const entity = {
//     partitionKey: partitionKey,
//     rowKey: `${row}`,
//     userName: userNameSanitised,
//     eggsAmount: eggsSanitised
//   };
//   await eggsTableClient.createEntity(entity);
//   eggsRowCount = row
// }


async function addEggsToUser(eggsToAdd, userName, channel) {
  await addEggs(userName, eggsToAdd);
  if (typeof channel !== 'undefined') {
    //const userEggs = (await dbGetEggs(userName)).eggs_amount;
    if (eggsToAdd === 1) { //because someone will complain otherwise
      chatClient.say(channel, "added " + eggsToAdd + " egg, " + userName + " now has " + userEggs + " eggs")
    } else if (eggsToAdd > 2) {
      chatClient.say(channel, "added " + eggsToAdd + " eggs, " + userName + " now has " + userEggs + " eggs")
    } else if (eggsToAdd === -1) { //because someone complained
      chatClient.say(channel, "removed " + Math.abs(eggsToAdd) + " egg, " + userName + " now has " + userEggs + " eggs")
    } else if (eggsToAdd < 0) {
      chatClient.say(channel, "removed " + Math.abs(eggsToAdd) + " eggs, " + userName + " now has " + userEggs + " eggs")
    } else {
      chatClient.say(channel, "Why?")
    }
  }
}

async function changeColourEvent(eventUserContent, viewer, channel) {
  let colourString = eventUserContent.replace(/#/g, '').toLowerCase()
  let regex = /[0-9A-Fa-f]{6}/g;
  let findHexInDB = await dbGetHex(colourString)
  if (colourString.match(regex)) {
    let colourName = (await dbGetColourByHex(colourString));
    await changeColour(colourString)
    if (colourName) {
      chatClient.say(channel, "According to my list, that colour is " + colourName);
    }
    chatClient.say(channel, "!addeggs " + viewer + " 4");
  } else if (findHexInDB != null) {
    chatClient.say(channel, "That colour is on my list! Congratulations, Here are 4 eggs!");
    chatClient.say(channel, "!addeggs " + viewer + " 4");
    await changeColour(findHexInDB)
  } else {
    const randomString = crypto.randomBytes(8).toString("hex").substring(0, 6);
    let randoColour = await dbGetColourByHex(randomString);
    chatClient.say(channel, "That colour isn't in my list. You missed out on eggs Sadge here is a random colour instead: " + (randoColour ? "Hex: " + randomString + " Colours: " + randoColour : randomString));
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
    });
    console.log(`Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`)
  } catch (error) {
    console.error('Failed to connect', error.code, error.message);
  }

  const hexToDecimal = hex => parseInt(hex, 16);
  let arrayOfHex = colour.match(/.{1,2}/g)
  let obsHexOrder = arrayOfHex.reverse().join("")
  let finalHex = "ff" + obsHexOrder
  const obsDecimalColour = hexToDecimal(finalHex);

  let myObject = {
    color: obsDecimalColour
  }

  await obs.call('SetSourceFilterSettings', { sourceName: 'Webcam shadow', filterName: 'colour', filterSettings: myObject });
  await obs.disconnect();
}

// Chat IRC Client:
const authProvider = new RefreshingAuthProvider({
  clientId,
  clientSecret,
  onRefresh: async newTokenData => await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
}, tokenData);

const chatClient = new ChatClient({ authProvider, channels: ['maddeth'] });

chatClient.connect();

chatClient.onRegister(() => {
  console.log("connected")
});

async function sendWebsocket(data) {
  for (const client in connectedClients) {
    if (connectedClients[client]) {
      connectedClients[client].send(JSON.stringify(data));
    }
  }
}

chatClient.onMessage(async (channel, user, message) => {
  let lowerCaseMessage = message.toLowerCase();
  if (lowerCaseMessage === "!colourlist" || lowerCaseMessage === "!colorlist" || lowerCaseMessage === "!colours") {
    chatClient.say(channel, user + " - you can find the colour list here " + myUrl + "/colours");
  }
  if (lowerCaseMessage === "!test") {
    chatClient.say(channel, user + "icles");
  }
  if (lowerCaseMessage.startsWith("!tts")) {
    var toTts = lowerCaseMessage.slice(4);
    var id = await runTTS(toTts)
    const tts = {
      type: "tts",
      id: id
    }
    await sendWebsocket(tts)
  }


  // if (user === annoyUser) {
  //   chatClient.say(channel, annoyEmote)
  // }
  // if(lowerCaseMessage.startsWith("!seteggs")){
  //   let isAMod = isBotMod(user);
  //   const setEggs = lowerCaseMessage.split(" ");
  //   const eggNumber = parseInt(Number(setEggs[2]))
  //   const eggUser = setEggs[1]
  //   if(isAMod){
  //     if(setEggs.length <= 2 || setEggs.length > 3 ){
  //       chatClient.say(channel, "The command is !seteggs username eggs");
  //     } else if (Number.isInteger(eggNumber)){
  //       await addEggsToUser(eggNumber, eggUser, channel);
  //     } else {
  //       chatClient.say(channel,"The command is !seteggs username eggs");
  //     }
  //   } else {
  //     chatClient.say(channel,"Looks like you are not a bot mod " + user + "... fuck off");
  //   }
  // }
  // if(lowerCaseMessage.startsWith("!geteggs")){
  //   const getEggsArray = lowerCaseMessage.split(" ");
  //   const diffUser = getEggsArray[1];
  //   if(typeof diffUser !== 'undefined'){
  //     const userEggs = (await dbGetEggs(diffUser)).eggs_amount
  //     chatClient.say(channel, diffUser + " has " + userEggs + " eggs")
  //   } else {
  //     const userEggs = (await dbGetEggs(user)).eggs_amount
  //     chatClient.say(channel, user + " has " + userEggs + " eggs")
  //   }
  // }
  // if(lowerCaseMessage.startsWith("!addcommand")){
  //   let isAMod = isBotMod(user);
  //   if(isAMod){
  //     const commandToAddArray = lowerCaseMessage.split(" ");
  //     const commandName = commandToAddArray[1];

  //     let commandToAdd = []
  //     for (let i = 2; i < commandToAddArray.length; i++){
  //       commandToAdd += commandToAddArray[i] + " "
  //     }
  //     if(commandToAddArray.length <= 1){
  //       chatClient.say(channel, "Command does not have enough arguements")
  //     } else {
  //       try {
  //         let response = await addCommand(commandName, commandToAdd)
  //         chatClient.say(channel, "Command " + response + " added")
  //       } catch {
  //         console.log("Command failed to add")
  //       }
  //     }
  //   }
  // }
  // if(lowerCaseMessage.startsWith("!updatecommand")){
  //   let isAMod = isBotMod(user);
  //   if(isAMod){
  //     const commandToUpdateArray = lowerCaseMessage.split(" ");
  //     const commandName = commandToUpdateArray[1];

  //     let commandToUpdate = []
  //     for (let i = 2; i < commandToUpdateArray.length; i++){
  //       commandToUpdate += commandToUpdateArray[i] + " "
  //     }
  //     if(commandToUpdateArray.length <= 1){
  //       chatClient.say(channel, "Command does not have enough arguements")
  //     } else {
  //       try {
  //         await updateCommand(commandName, commandToUpdate)
  //         chatClient.say(channel, "Command " + commandName + " updated")
  //       } catch {
  //         console.log("Command failed to update")
  //       }
  //     }
  //   }
  // }
  // if(lowerCaseMessage.startsWith("!removecommand")){
  //   let isAMod = isBotMod(user);
  //   if(isAMod){
  //     const commandToRemoveArray = lowerCaseMessage.split(" ");
  //     const commandName = commandToRemoveArray[1];

  //     if(commandToRemoveArray.length <= 1){
  //       chatClient.say(channel, "Command does not have enough arguements")
  //     } else {
  //       try {
  //         await removeCommand(commandName)
  //         chatClient.say(channel, "Command " + commandName + " deleted")
  //       } catch {
  //         console.log("Command failed to update")
  //       }
  //     }
  //   }
  //}
  // if(lowerCaseMessage.startsWith("!quote")){
  //   const quoteCommand = lowerCaseMessage.split(" ");
  //   const commandType = quoteCommand[1];
  //   let isAMod = isBotMod(user);    
  //   if(isAMod){
  //     if(commandToRemoveArray.length <= 2){
  //       chatClient.say(channel, "Command does not have enough arguements")
  //     } else {

  //     }
  //   }
  // }
  // if(lowerCaseMessage.startsWith("!")){
  //   const commandArray = lowerCaseMessage.split(" ");
  //   const command = commandArray[0];
  //   let response = await getCommand(command)
  //   if(response){
  //     chatClient.say(channel, response)
  //   }
  // }
});

// async function addCommand(command, commandRequest){
//   let added = await commands.create({
//     command: command,
//     response: commandRequest
//   })
//   return added ? added.dataValues.command : false
// }

// async function updateCommand(command, commandRequest){
//   await commands.update({
//     response: commandRequest
//   },
//   {
//     where: { command: command },
//   });
// }

// async function removeCommand(command){
//   const row = await commands.findOne({
//     where: { command: command },
//   });
//   if (row){
//     await row.destroy();
//   }
// }


// async function getCommand(commandRequest){
//   let commandResponse = await commands.findOne({
//     attributes: ['response'],
//     where: {
//       command: commandRequest
//     }
//   });
//   return commandResponse ? commandResponse.dataValues.response : false
// }

const api = new ApiClient({ authProvider });

async function getUser() {
  let users = await api.chat.getChatters('30758517', '558612609');
  users.data.forEach(async user => {
    const check = await isSub(user.userDisplayName);
    addEggsToUser(check, user.userDisplayName)
  });
}

async function isSub(subName) {
  const authProvider = new RefreshingAuthProvider(
    {
      clientId,
      clientSecret,
      onRefresh: async newTokenData => await fs.writeFile('./tokens_me.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
    },
    tokenDataMe
  );
  const apiSub = new ApiClient({ authProvider });
  const subs = await apiSub.subscriptions.getSubscriptionsPaginated('30758517').getAll();
  const subsData = subs.map(function (sub) {
    return sub.userDisplayName;
  });
  if (subsData.includes(subName)) {
    return 10;
  } else {
    return 5;
  }
}

setInterval(async function () { await isStreamLive("maddeth") }, 900000);

async function isStreamLive(userName) {
  const stream = await api.streams.getStreamByUserName({ name: userName, });
  if (stream !== null) {
    await getUser();
  } else {
    console.log("Stream offline")
  }
}

// Express App

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}));

app.listen(port, () => {
  console.log(`Twitch Webhook listening at http://localhost:${port}`)
});

app.get('/', (req, res) => {
  res.redirect(301, 'https://www.twitch.tv/maddeth');
});

app.get('/add-colour', (req, res) => {
  res.sendFile("/home/html/form.html")
  res.status(200)
});

app.get('/my.css', (req, res) => {
  res.sendFile("/home/html/my.css")
  res.status(200)
});

app.get("/colours/:id", async (req, res, next) => {
  let result = await dbGetColour(req.params.id)
  res.status(200).json(result);
});

app.get("/colours", (req, res) => {
  res.sendFile("/home/html/colourlist.html")
  res.status(200)
});

app.get("/colour-list.json", async (req, res, next) => {
  let result = await dbGetAllColours()
  res.status(200).json(JSON.parse(result))
});

// TODO: rewrite this
app.post("/colours/", async (req, res, next) => {
  let reqBody = req.body;
  let regex = /[0-9A-Fa-f]{6}/g;
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
});

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
      "callback": myUrl + "/notification", // If you change the /notification path make sure to also adjust in line 114
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
});

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

//Twitch Event Sub
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
    let newEvent = event.body.event.reward.title
    let userInput = String(event.body.event.user_input)
    let viewerName = event.body.event.user_name
    let channel = event.body.event.broadcaster_user_login

    console.log(viewerName + " redeemed " + "\"" + newEvent + "\"")
    res.send("") // Send a 200 status

    actionEventSub(newEvent, userInput, viewerName, channel)
  }
}

//Event Sub actions
async function actionEventSub(eventTitle, eventUserContent, viewer, channel) {
  if (eventTitle === 'Convert Feed to 100 Eggs') {
    chatClient.say(channel, "!addeggs " + viewer + " 100")
    await addEggsToUser(100, viewer);
  } else if (eventTitle === 'Convert Feed to 2000 Eggs') {
    chatClient.say(channel, "!addeggs " + viewer + " 2000");
    await addEggsToUser(2000, viewer);
  } else if (eventTitle === 'Shadow Colour') {
    const colour = {
      type: "redeem",
      id: "https://www.myinstants.com/media/sounds/unlimited-colors.mp3"
    }
    await sendWebsocket(colour)
    changeColourEvent(eventUserContent, viewer, channel)
  }
}

const ttsStreamElementsHandler = async (text) => {
  try {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=Geraint&text=${encodeURI(text)}`;
    const result = await fetch(url, { method: 'GET', });
    const buffer = await result.buffer();
    return buffer;
  } catch (error) {
    console.error(error);
  }
  return null;
};

async function getVoiceBuffer(text) {
  const buffer = await ttsStreamElementsHandler(text);
  return buffer;
}

const runTTS = async (message) => {
  let currentMessage = message;
  let buffer = Buffer.from([]);

  if (currentMessage.length > 0) {
    const result = await getVoiceBuffer(currentMessage);
    if (result) {
      buffer = Buffer.concat([buffer, result]);
    }
  }

  const id = Math.random().toString(36).substring(2, 15);
  fs.writeFile(`/home/html/tts/${id}.mp3`, buffer);
  return id;
}

app.get('/tts/:id', (req, res) => {
  let audioFilePath = `/home/html/tts/${req.params.id}.mp3`
  res.sendFile(audioFilePath);
});
