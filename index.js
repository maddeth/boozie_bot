import bodyParser from 'body-parser';
import { ChatClient } from '@twurple/chat';
import crypto from 'crypto';
import express from 'express';
import https from 'https';
import OBSWebSocket from 'obs-websocket-js';
import { RefreshingAuthProvider } from '@twurple/auth';
import { promises as fs } from 'fs';
import sqlite3 from 'sqlite3';
import { ApiClient } from '@twurple/api';

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

const obs = new OBSWebSocket();
const app = express();

// Chat IRC Client:
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

chatClient.onMessage(async (channel, user, message) => {
  let lowerCaseMessage = message.toLowerCase();
  if(lowerCaseMessage === "!colourlist" || lowerCaseMessage === "!colorlist" || lowerCaseMessage === "!colours") {
    chatClient.say(channel, user + " - you can find the colour list here " + myUrl + "/colours");
  }
  if(lowerCaseMessage.startsWith("!seteggs")){
    let isAMod = botMod(user)
    const setEggs = lowerCaseMessage.split(" ");
    const eggNumber = parseInt(Number(setEggs[2]))
    const eggUser = setEggs[1]
    if(isAMod){
      if(setEggs.length <= 2 || setEggs.length > 3 ){
        chatClient.say(channel, "The command is !seteggs username eggs");
      } else if (Number.isInteger(eggNumber)){
        await addEggsToUser(eggNumber, eggUser, channel);
      } else {
        chatClient.say(channel,"The command is !seteggs username eggs");
      }
    } else {
      chatClient.say(channel,"Looks like you are not a bot mod " + user + "... fuck off");
    }
  }
});

function botMod(modName){
  if(modlist.includes(modName)){
    return true;
  } else {
    return false;
  }
}

//Chat API
const api = new ApiClient({authProvider});

async function getUser() {
  let users = await api.chat.getChatters('30758517', '558612609');
  users.data.forEach(async user => {
    const check = await isSub(user.userDisplayName);
    console.log(check)
    addEggsToUser(check, user.userDisplayName)
  });
}

async function isSub(subName){
  const authProvider = new RefreshingAuthProvider(
    {
      clientId,
      clientSecret,
      onRefresh: async newTokenData => await fs.writeFile('./tokens_me.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
    },
    tokenDataMe
  );
  const apiSub = new ApiClient({authProvider});
  const subs = await apiSub.subscriptions.getSubscriptionsPaginated('30758517').getAll();
  const subsData = subs.map(function(sub){
    return sub.userDisplayName;
  });
  if(subsData.includes(subName)){
    return 10;
  } else {
    return 5;
  }
}

// setInterval(isStreamLive(), 900000);

setInterval(async function() {await isStreamLive("maddeth")}, 900000);

async function isStreamLive(userName) {
  const stream = await api.streams.getStreamByUserName({name: userName,});
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
  res.sendFile("/home/html/")
});

app.get("/colours/:id", async (req, res, next) => {
  var params = [req.params.id]
  let result = await dbGetColour("SELECT hex_code, colour_name FROM colours WHERE colour_id = ?", params)
  res.status(200).json(result);
});


app.get("/colours", async (req, res, next) => {
  let result = await dbGetAllColours("SELECT hex_code, colour_name FROM colours")
  res.status(200).json(result)
});

app.post("/colours/", (req, res, next) => {
  var reqBody = re.body;
  booziedb.run(`INSERT INTO colours (colour_name, hex_code) VALUES (?,?)`,
      [reqBody.colour_name, reqBody.hex_code],
      function (err, result) {
          if (err) {
              res.status(400).json({ "error": err.message })
              return;
          }
          res.status(201).json({
              "colour_id": this.lastID
          })
      });
});

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

//Event Sub actions
async function actionEventSub(eventTitle, eventUserContent, viewer, channel) {
  if(eventTitle === 'Convert Feed to 100 Eggs'){
    chatClient.say(channel, "!addeggs " + viewer + " 100")
    await addEggsToUser(100, viewer);
  } else if (eventTitle === 'Convert Feed to 2000 Eggs') {
    chatClient.say(channel, "!addeggs " + viewer + " 2000");
    await addEggsToUser(2000, viewer);
  } else if (eventTitle === 'Sound Alert: Shadow colour') {
    changeColourEvent(eventUserContent, viewer, channel)
  }
}

async function changeColourEvent(eventUserContent, viewer, channel) {
  var colourString = eventUserContent.replace(/#/g, '').toLowerCase()
  var regex = /[0-9A-Fa-f]{6}/g;
  var findHexInDB = await getHex(colourString)
  if (colourString.match(regex)){
    await changeColour(colourString)
    let colourName = await getColourName(colourString);
    if (colourName) {
      chatClient.say(channel, "According to my list, that colour is " + colourName);
    }
    chatClient.say(channel, "!addeggs " + viewer + " 4");
  } else if (findHexInDB !== undefined) {
      chatClient.say(channel, "That colour is on my list! Congratulations, Here are 4 eggs!");
      chatClient.say(channel, "!addeggs " + viewer + " 4");
      await changeColour(findHexInDB)
  } else {
      const randomString = crypto.randomBytes(8).toString("hex").substring(0, 6);
      let randoColour = await getColourName(randomString);
      chatClient.say(channel, "That colour isn't in my list. You missed out on eggs Sadge here is a random colour instead: " + (randoColour ? randoColour : randomString));
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

//Colour Database
const booziedb = new sqlite3.Database('/home/sqlitedb/boozie_db.db', (err) => {
  if (err) {
    console.error("Error opening database " + err.message);
  } 
});

async function dbGetColourByHex(query, id){
  return new Promise((resolve,reject) => {
    const queries = [];
    booziedb.each(query, id, function(err,result){
      if(err){reject(err);}
      queries.push(result.colour_name);
    }, (err, n) => {
      if (err) {reject(err);} else {
        resolve(queries[0]);
      }
    });
  });
}

async function dbGetColour(query, id){
  return new Promise(function(resolve,reject){
    booziedb.each(query, id, function(err,result){
      if(err){return reject(err);}
      resolve(result.colour_name + ": " + result.hex_code);
    });
  });
}

async function dbGetAllColours(query){
  return new Promise(function(resolve,reject){
    booziedb.all(query, function(err,result){
      if(err){return reject(err);}
      resolve(result);
    });
  });
}

async function dbGetHex(query, colour){
  return new Promise((resolve,reject) => {
    const queries = [];
    booziedb.each(query, colour, function(err,result){
      if(err){reject(err);}
      queries.push(result.hex_code);
    }, (err, n) => {
      if (err) {reject(err);} else {
        resolve(queries[0]);
      }
    });
  });
}

async function dbAddColour(query, values){
  return new Promise(function(resolve,reject){
    booziedb.run(query, values, function(err,result){
      if(err){return reject(err);}
      resolve(result);
    });
  });
}

async function getHex(event) {
  let query = "SELECT hex_code FROM colours WHERE replace(colour_name, ' ', '') = ?"
  let colourLookup = event.toLowerCase().replace(/ /g,"")
  let value = await dbGetHex(query, colourLookup)
  console.log("Got Hex value: " + value);
  return value;
}

async function getColourName(event) {
  let query = "SELECT colour_name FROM colours WHERE hex_code = ?"
  let colourLookup = event.toLowerCase().replace(/ /g,"")
  let value = await dbGetColourByHex(query, colourLookup)
  console.log("Got colour value: " + value);
  return value;
}

//Eggs DB
async function addEggsToUser(eggsToAdd, userName, channel) {
  let checkUserExists = await getEggs(`SELECT EXISTS(SELECT 1 FROM users WHERE user_name = ?) AS eggs_amount`, userName)
  if(checkUserExists === 0){
    console.log("User doesn't exist, create")
    await dbAddEggs(`INSERT OR IGNORE INTO users (eggs_amount, user_name) VALUES (?,?)`, [eggsToAdd, userName])
  } else {
    let currentEggs = Number(await getEggs(`SELECT eggs_amount FROM users WHERE user_name = ?`, userName))
    let totalEggsToAdd = currentEggs + eggsToAdd
    await dbAddEggs(`UPDATE users SET eggs_amount=? WHERE user_name = ?`, [totalEggsToAdd, userName]);
  }

  if(typeof channel !== 'undefined'){
    const userEggs = await getEggs(`SELECT eggs_amount FROM users WHERE user_name = ?`, userName);
    if(eggsToAdd === 1){ //because someone will complain otherwise
      chatClient.say(channel, "added " + eggsToAdd + " egg, " + userName + " now has " + userEggs + " eggs")
    } else if(eggsToAdd > 2) {
      chatClient.say(channel, "added " + eggsToAdd + " eggs, " + userName + " now has " + userEggs + " eggs")
    } else if(eggsToAdd === -1){ //because someone complained
      chatClient.say(channel, "removed " + Math.abs(eggsToAdd) + " egg, " + userName + " now has " + userEggs + " eggs")
    } else if(eggsToAdd < 0){
      chatClient.say(channel, "removed " + Math.abs(eggsToAdd) + " eggs, " + userName + " now has " + userEggs + " eggs")
    } else {
      chatClient.say(channel, "Why?")
    }
  }
}

async function getEggs(query, user){
  return new Promise(function(resolve,reject){
    booziedb.each(query, user, function(err,result){
      if(err){return reject(err);}
      resolve(result.eggs_amount);
    });
  });
}

async function dbAddEggs(query, values){
  return new Promise(function(resolve,reject){
    booziedb.run(query, values, function(err,result){
      if(err){return reject(err);}
      resolve(result);
    });
  });
}
