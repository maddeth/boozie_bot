FROM node:16.19.0-alpine3.16

RUN mkdir -p /home/node/bot/node_modules && chown -R node:node /home/node/bot

WORKDIR /home/node/bot

COPY package*.json ./

USER node

RUN npm install

COPY --chown=node:node . .

EXPOSE 3000

CMD [ "node", "index.js" ]
