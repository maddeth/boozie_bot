import bodyParser from 'body-parser';
import { ChatClient } from '@twurple/chat';
import crypto from 'crypto';
import express from 'express';
import https from 'https';
import OBSWebSocket from 'obs-websocket-js';
import { RefreshingAuthProvider } from '@twurple/auth';
import { promises as fs } from 'fs';
import { Sequelize, DataTypes } from 'sequelize';
import { ApiClient } from '@twurple/api';
import { exit } from 'process';

// config

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
const databaseLocation = JSON.parse(await fs.readFile('./config.json', 'utf-8')).DatabaseFile;
const port = 3000;

// isBotMod?

function isBotMod(modName){
  return modlist.includes(modName);
}

// obs websocket

const obs = new OBSWebSocket();

// app definiton
const app = express();

// sqlite database

const booziedb = new Sequelize('database', 'username', 'password', {
  dialect: 'sqlite',
  storage: databaseLocation,
});

try {
  await booziedb.authenticate();
  console.log('Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
  exit();
}

// database models definiton

const colour = booziedb.define('colour', {
    hex_code: {
      type: DataTypes.STRING,
      allowNull: false
    },
    colour_name: {
      type: DataTypes.STRING,
      allowNull: false
    }
  },
  {
    timestamps: false
  }
);

const user = booziedb.define('user', {
  user_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  eggs_amount: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
},
{
  timestamps: false
}
);

// DB Query functions

async function dbGetAllColours() {
return colour.findAll();
}

async function dbGetHex(event) {
return colour.findOne({
  attributes: ['hex_code'],
  where: booziedb.where(
    booziedb.fn('replace', booziedb.col('colour_name'), ' ', ''),
    event.toLowerCase().replace(/ /g,"")
  )
});
}

async function dbGetColourByHex(hexCode) {
return (await colour.findAll({
  attributes: ['colour_name'],
  where: booziedb.where(
    booziedb.fn('replace', booziedb.col('hex_code'), ' ', ''), 
    hexCode.toLowerCase().replace(/ /g,"")
  )
})).map(c => c.colour_name).join(", ");
}

async function dbGetColour(id) {
return colour.findOne({
  attributes: ['colour_name', 'hex_code'],
  where: { 
    colour_id: id
  }
});
}

// TODO: rewrite this

async function dbAddColour(query, values) {
return new Promise(function(resolve,reject){
  booziedb.run(query, values, function(err,result){
    if(err){return reject(err);}
    resolve(result);
  });
});
}

async function dbGetEggs(userName) {
return user.findOne({
  where: {
    user_name: userName
  }
});
}

async function dbAddEggs(userName, eggs) {
return await user.update(
  {
    eggs_amount: eggs
  },
  {
    where: { user_name: userName },
  }
);
}

async function dbNewUserEggs(userName, eggs) {
await user.create(
  {
    user_name: userName,
    eggs_amount: eggs
  }
)
}

async function addEggs(userName, eggs) {
let dbUser = await dbGetEggs(userName);
if (dbUser != null)
{
  dbAddEggs(userName , (dbUser.eggs_amount + eggs))
}
else
{
  dbNewUserEggs(userName, eggs)
}
}

// chat commands

async function addEggsToUser(eggsToAdd, userName, channel) {
  addEggs(userName, eggsToAdd);

  if(typeof channel !== 'undefined'){
    const userEggs = (await dbGetEggs(userName)).eggs_amount;
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

async function changeColourEvent(eventUserContent, viewer, channel) {
  let colourString = eventUserContent.replace(/#/g, '').toLowerCase()
  let regex = /[0-9A-Fa-f]{6}/g;
  let findHexInDB = await dbGetHex(colourString)
  if (colourString.match(regex)){
    await changeColour(colourString)
    let colourName = (await dbGetColourByHex(colourString)).colour_name;
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
      let randoColour = (await dbGetColourByHex(randomString)).colour_name;
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
  let arrayOfHex = colour.match(/.{1,2}/g)
  let obsHexOrder = arrayOfHex.reverse().join("")
  let finalHex = "ff" + obsHexOrder
  const obsDecimalColour = hexToDecimal(finalHex);

  let myObject = {
    color: obsDecimalColour
  }
  
  await obs.call('SetSourceFilterSettings',{sourceName: 'Webcam shadow', filterName: 'colour', filterSettings: myObject});
  await obs.disconnect();
}

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
    let isAMod = isBotMod(user);
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
  if(lowerCaseMessage.startsWith("!geteggs")){
    const getEggsArray = lowerCaseMessage.split(" ");
    const diffUser = getEggsArray[1];
    console.log(diffUser)
    if(typeof diffUser !== 'undefined'){
      const userEggs = await getEggs(`SELECT eggs_amount FROM users WHERE user_name = ?`, diffUser);
      chatClient.say(channel, diffUser + " has " + userEggs + " eggs")
    } else {
      const userEggs = await getEggs(`SELECT eggs_amount FROM users WHERE user_name = ?`, user);
      chatClient.say(channel, user + " has " + userEggs + " eggs")
    }
  } 
});

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
  let result = await dbGetColour(req.params.id)
  res.status(200).json(json.stringify(result));
});


app.get("/colours", async (req, res, next) => {
  let result = await dbGetAllColours()
  res.status(200).json(JSON.stringify(result))
});

// TODO: rewrite this

app.post("/colours/", (req, res, next) => {
  let reqBody = re.body;
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
      "callback": myUrl+"/notification", // If you change the /notification path make sure to also adjust in line 114
      "secret": secret
    }
  }

  let responseData = ""
  let webhookReq = https.request(createWebHookParams, (result) => {
    result.setEncoding('utf8')
    result.on('data', function(d) {
      responseData = responseData + d
    })
    .on('end', function(result) {
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
