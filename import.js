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
// import { dbAddColour, dbGetAllColours, dbGetColourByHex, dbGetHex, dbGetColour, coloursRowCount } from './colours.js';
import { dbGetAllEggs, dbUpdateEggs, dbAddEggUser } from './eggs.js';
import { v4 as uuidv4 } from 'uuid';
import config from './config.json' assert { type: "json" };

const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'UTF-8'));
const tokenDataMe = JSON.parse(await fs.readFile('./tokens_me.json', 'UTF-8'));
const modlist = JSON.parse(await fs.readFile('./modList.json', 'UTF-8'));
const userList = JSON.parse(await fs.readFile('./users.json', 'UTF-8'));

const clientId = config.clientId;
const clientSecret = config.clientSecret;
const bearerToken = config.bearer;
const secret = config.secret;
const obsPassword = config.obsPassword;
const obsIP = config.obsIP;
const myUrl = config.webAddress;
const port = config.port;
const webSocketPort = config.webSocketPort;
const myChannel = config.myChannel;
const eggUpdateInterval = config.eggUpdateInterval;

console.log("something")
console.log(userList.length)
for (var i = 0; i < userList.length; i++) {
  console.log(i)
  var obj = userList[i];
  for (var key in obj) {
    console.log(key)
    // await dbAddEggUser(key, userList[key])
  }
}