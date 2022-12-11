# boozie_bot
The is my (maddeth) twitch bot. It currently just:

Changes the colour filter on OBS on a redemption

Adds "eggs" on my channel using my bot account - again, using redemption.

# Quick docker guide I used to get nginx talking to node over https:
https://www.digitalocean.com/community/tutorials/how-to-secure-a-containerized-node-js-application-with-nginx-let-s-encrypt-and-docker-compose

# Quick Start Instructions
You will need to create 5 "config" files for this to run:
Nginx config listening on port 80 and 443, redirecting all traffic to 443 (see above)
- nginx-conf/nginx.conf
Generate private key for ssl (see above)
 - dhparam/dhparam-2048.pem

You will need a .env file for docker to pick up the set variables
- .env
```
EMAIL=YOUR_EMAIL
HOSTNAME=YOUR_HOSTNAME
BOTPATH=PATH/TO/YOUR/BOT
```

A secret.json file
- secret.json
```
{
  "clientId":"YOUR_BOT_CLIENT_ID",
  "clientSecret":"YOUR_BOT_CLIENT_SECRET",
  "secret":"SOME_OBSUCRE_PHRASE_OR_RANDOM_STRING",
  "bearer":"Bearer YOUR_BEARER_TOKEN",
  "obsPassword":"YOUR_OBS_PASSWORD",
  "obsIP":"ws://YOUR_OBS_IP:YOUR_OBS_PORT"
}
```

A tokens.js file (this will auto refresh one you have obtained the access and refresh token)
- token.json
```{
    "accessToken": "YOUR_ACCESS_TOKEN",
    "refreshToken": "YOUR_REFRESH_TOKEN",
    "expiresIn": 0, // Set this to zero on first run so it auto refreshed straight away
    "obtainmentTimestamp": 0 // Set this to zero on first run so it auto refreshed straight away
}
```
