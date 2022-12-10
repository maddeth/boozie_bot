import bodyParser from 'body-parser';
import { ChatClient } from '@twurple/chat';
import crypto from 'crypto';
import express from 'express';
import https from 'https';
import OBSWebSocket from 'obs-websocket-js';
import { RefreshingAuthProvider } from '@twurple/auth';
import { promises as fs } from 'fs';

const colours = JSON.parse(await fs.readFile('./colours', 'UTF-8'));

const clientId = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).clientId;
const clientSecret = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).clientSecret;
const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'UTF-8'));
const bearerToken = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).bearer;
const secret = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).secret;
const obsPassword = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).obsPassword;
const obsIP = JSON.parse(await fs.readFile('./secret.json', 'UTF-8')).obsIP;

const authProvider = new RefreshingAuthProvider(
  {
    clientId,
    clientSecret,
    onRefresh: async newTokenData => await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
  },
  tokenData
);

var emptyString

function getHex(event){
  var lower = event.toLowerCase().replace(/ /g, "")
  if (colours[lower]){
    emptyString = colours[lower]
    return emptyString
  }
}

const obs = new OBSWebSocket();

const chatClient = new ChatClient({ authProvider, channels: ['maddeth'] });
chatClient.connect();

chatClient.onRegister(() => {
  console.log("connected")
});


function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
}

const app = express()
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))

const port = 3000

let myUrl = 'https://maddeth.com'

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
  webhookReq.on('error', (e) => { console.log("Error") })
  webhookReq.write(JSON.stringify(createWebHookBody))
  webhookReq.end()
})

function verifySignature(messageSignature, messageID, messageTimestamp, body) {
  let message = messageID + messageTimestamp + body
  let signature = crypto.createHmac('sha256', secret).update(message)
  let expectedSignatureHeader = "sha256=" + signature.digest("hex")

  return expectedSignatureHeader === messageSignature
}

app.post('/notification', (req, res) => {
  if (!verifySignature(req.header("Twitch-Eventsub-Message-Signature"),
      req.header("Twitch-Eventsub-Message-Id"),
      req.header("Twitch-Eventsub-Message-Timestamp"),
      req.rawBody)) {
        res.status(403).send("Forbidden") // Reject requests with invalid signatures
  } else {
    if (req.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
      console.log(req.body.challenge)
      res.send(req.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
    } else if (req.header("Twitch-Eventsub-Message-Type") === "notification") {
      console.log(req.body.event.user_name + " redeemed " + "\"" + req.body.event.reward.title + "\"") // Implement your own use case with the event data at this block
      res.send("") // Default .send is a 200 status
      if(req.body.event.reward.title === 'Convert Feed to 100 Eggs'){
        chatClient.say(req.body.event.broadcaster_user_login, "!addeggs " + req.body.event.user_name + " 100");
      } else if (req.body.event.reward.title === 'Convert Feed to 2000 Eggs') {
        chatClient.say(req.body.event.broadcaster_user_login, "!addeggs " + req.body.event.user_name + " 2000");
      } else if (req.body.event.reward.title === 'Sound Alert: Shadow colour') {
        var colourString = req.body.event.user_input.replace(/#/g, '')
        var regex = /[0-9A-Fa-f]{6}/g;
        if (colourString.match(regex)){
          changeColour(colourString)
          chatClient.say(req.body.event.broadcaster_user_login, "!addeggs " + req.body.event.user_name + " 4");
        } else if (getHex(colourString)) {
          chatClient.say(req.body.event.broadcaster_user_login, "That colour is on my list! Congratulations, Here are 4 eggs!");
          chatClient.say(req.body.event.broadcaster_user_login, "!addeggs " + req.body.event.user_name + " 4");
          changeColour(emptyString)
        } else {
          const randomString = crypto.randomBytes(8).toString("hex").substring(0, 6);
          chatClient.say(req.body.event.broadcaster_user_login, "That colour isn't in my list, defaulting to blue. You missed out on eggs Sadge, here is a random colour instead: " + randomString);
          changeColour(randomString)
        }
      }
    }
  }
})    

app.listen(port, () => {
  console.log(`Twitch Webhook Example listening at http://localhost:${port}`)
})

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + "/html/")
})

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
  
  var array = colour.match(/.{1,2}/g)
  var actual = array.reverse().join("")
  var thing = "ff" + actual
  
  const myVal = hexToDecimal(thing);

  var myObject = {
    color: myVal
  }
  
  await obs.call('SetSourceFilterSettings',{sourceName: 'Webcam shadow', filterName: 'colour', filterSettings: myObject});
  
  await obs.disconnect();
}
