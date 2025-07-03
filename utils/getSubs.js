
import { RefreshingAuthProvider } from '@twurple/auth'
import { promises as fs } from 'fs'
import { ApiClient } from '@twurple/api'
import config from '../config.json' with { type: "json" }

const streamerID = config.myChannelUserId
// const tokenData = JSON.parse(await fs.readFile(`./tokens.${streamerID}.json`, 'UTF-8'))
const clientId = config.clientId
const clientSecret = config.clientSecret
const authProvider = new RefreshingAuthProvider({ clientId, clientSecret })
const boozieBotUserID = config.boozieBotUserID
// const streamerID = config.myChannelUserId

// Use streamer token for subscription checking since it has channel:read:subscriptions scope
const tokenData = JSON.parse(await fs.readFile(`./tokens.${streamerID}.json`, 'UTF-8'))

authProvider.onRefresh(async (streamerID, newTokenData) => await fs.writeFile(`./tokens.${streamerID}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8'))

await authProvider.addUserForToken(tokenData, ['chat:read', 'chat:edit', 'moderator:read:chatters', 'channel:read:subscriptions'])

const api = new ApiClient({ authProvider })

export async function subLookup(viewerName, viewerId) {
  try {
    // Use the broadcaster's context to check if the viewer is subscribed
    const isSubbed = await api.subscriptions.getSubscriptionForUser(streamerID, viewerId)
    let tier = "0"
    if (isSubbed != null) {
      tier = isSubbed.tier.slice(0, -3)
      console.log(viewerName + " is tier " + tier)
      return tier
    } else {
      console.log(viewerName + " is tier " + tier)
      return tier
    }
  } catch (error) {
    console.error(`Error checking subscription for ${viewerName}: ${error.message}`)
    // Return tier 0 if we can't check subscription status
    return "0"
  }
}
