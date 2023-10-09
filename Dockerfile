FROM node:18.14.1-alpine3.16

RUN mkdir -p /home/node/bot/node_modules && chown -R node:node /home/node/bot

WORKDIR /home/node/bot

COPY package.json ./

RUN chown -R node:node package.json

USER node

RUN npm install --legacy-peer-deps

COPY --chown=node:node . .

EXPOSE 3000 3001

CMD [ "node", "index.js" ]
