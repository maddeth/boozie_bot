#!/usr/bin/env node

/**
 * Bot Re-authorization Script
 * This script helps you re-authorize your bot with additional scopes
 */

import express from 'express'
import { promises as fs } from 'fs'
import config from '../config.json' with { type: "json" }

const app = express()
const PORT = 3002 // Different port to avoid conflicts

const clientId = config.clientId
const clientSecret = config.clientSecret
const redirectUri = `http://localhost:${PORT}/callback`
const botUserId = config.boozieBotUserID

// Required scopes for the bot
const scopes = [
    'chat:read',
    'chat:edit', 
    'moderator:read:chatters',
    'channel:read:subscriptions',  // This is the new scope we need
    'user:read:subscriptions'      // Alternative scope for user-specific sub checks
].join('+')

console.log('🚀 Starting bot re-authorization process...')
console.log('📋 Required scopes:', scopes.replace(/\+/g, ', '))

// Step 1: Generate authorization URL
const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}`

console.log('\n' + '='.repeat(80))
console.log('🔐 STEP 1: Authorize your bot')
console.log('='.repeat(80))
console.log('1. Open this URL in your browser:')
console.log(`\n   ${authUrl}\n`)
console.log('2. Log in as your BOT account (not your streamer account)')
console.log('3. Click "Authorize" to grant permissions')
console.log('4. You will be redirected back to this script')
console.log('='.repeat(80))

// Step 2: Handle callback and exchange code for token
app.get('/callback', async (req, res) => {
    const { code, error } = req.query

    if (error) {
        console.error('❌ Authorization failed:', error)
        res.send(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`)
        return
    }

    if (!code) {
        console.error('❌ No authorization code received')
        res.send('<h1>Error</h1><p>No authorization code received</p>')
        return
    }

    try {
        console.log('\n✅ Authorization code received!')
        console.log('🔄 Exchanging code for access token...')

        // Exchange code for access token
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            })
        })

        const tokenData = await tokenResponse.json()

        if (tokenData.error) {
            throw new Error(`Token exchange failed: ${tokenData.error_description}`)
        }

        console.log('✅ Token exchange successful!')
        console.log('📊 Token info:')
        console.log(`   - Access Token: ${tokenData.access_token.substring(0, 10)}...`)
        console.log(`   - Refresh Token: ${tokenData.refresh_token.substring(0, 10)}...`)
        console.log(`   - Expires in: ${tokenData.expires_in} seconds`)
        console.log(`   - Scopes: ${tokenData.scope.join(', ')}`)

        // Verify the token has the required scopes
        const requiredScopes = ['chat:read', 'chat:edit', 'moderator:read:chatters', 'channel:read:subscriptions']
        const hasAllScopes = requiredScopes.every(scope => tokenData.scope.includes(scope))

        if (!hasAllScopes) {
            console.warn('⚠️  Warning: Not all required scopes were granted')
            console.log('   Required:', requiredScopes.join(', '))
            console.log('   Granted:', tokenData.scope.join(', '))
        }

        // Format token data for Twurple
        const formattedTokenData = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
            obtainmentTimestamp: Date.now(),
            scope: tokenData.scope
        }

        // Save the new token
        const tokenFile = `./tokens.${botUserId}.json`
        const backupFile = `./tokens.${botUserId}.backup.json`

        // Backup existing token
        try {
            const existingToken = await fs.readFile(tokenFile, 'utf-8')
            await fs.writeFile(backupFile, existingToken)
            console.log(`📁 Existing token backed up to ${backupFile}`)
        } catch (err) {
            console.log('ℹ️  No existing token to backup')
        }

        // Save new token
        await fs.writeFile(tokenFile, JSON.stringify(formattedTokenData, null, 4))
        console.log(`💾 New token saved to ${tokenFile}`)

        res.send(`
            <h1>✅ Bot Re-authorization Complete!</h1>
            <p><strong>Token saved successfully!</strong></p>
            <p>Granted scopes: ${tokenData.scope.join(', ')}</p>
            <p>You can now close this window and stop the script (Ctrl+C)</p>
            <hr>
            <p><small>Token file: ${tokenFile}</small></p>
        `)

        console.log('\n' + '='.repeat(80))
        console.log('🎉 SUCCESS! Bot re-authorization complete')
        console.log('='.repeat(80))
        console.log('✅ Your bot now has the required permissions to check subscriptions')
        console.log('📁 Token saved and ready to use')
        console.log('🔄 You can now restart your bot to use the new permissions')
        console.log('\nPress Ctrl+C to stop this script')
        console.log('='.repeat(80))

    } catch (error) {
        console.error('❌ Error during token exchange:', error.message)
        res.send(`<h1>Error</h1><p>${error.message}</p>`)
    }
})

// Start the temporary server
app.listen(PORT, () => {
    console.log(`\n🌐 Temporary server started on http://localhost:${PORT}`)
    console.log('⏳ Waiting for authorization...')
})

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down authorization server...')
    process.exit(0)
})