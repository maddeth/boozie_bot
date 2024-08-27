
import { RefreshingAuthProvider } from '@twurple/auth'
import { promises as fs } from 'fs'
import { ApiClient } from '@twurple/api'
import config from './config.json' with { type: "json" }

const streamerID = config.myChannelUserId
const tokenData = JSON.parse(await fs.readFile(`./tokens.${streamerID}.json`, 'UTF-8'))
const clientId = config.clientId
const clientSecret = config.clientSecret
const authProvider = new RefreshingAuthProvider({ clientId, clientSecret })

authProvider.onRefresh(async (streamerID, newTokenData) => await fs.writeFile(`./tokens.${streamerID}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8'))

await authProvider.addUserForToken(tokenData, ['chat'])
await authProvider.addUserForToken(tokenData, ['user:read:subscriptions'])

const api = new ApiClient({ authProvider })

export async function subLookup(viewerName, viewerId) {
  const isSubbed = await api.subscriptions.getSubscriptionForUser(streamerID, viewerId)
  let tier = "0"
  if (isSubbed != null) {
    tier = isSubbed.tier.slice(0, -3)
    // console.log(viewerName + " is tier " + tier)
    return tier
  } else {
    // console.log(viewerName + " is tier " + tier)
    return tier
  }
}
