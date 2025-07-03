#!/usr/bin/env node

/**
 * Streamer Re-authorization Script
 * This script helps you re-authorize your streamer account
 */

import express from 'express'
import { promises as fs } from 'fs'
import config from '../config.json' with { type: "json" }

const app = express()
const PORT = 3003 // Different port to avoid conflicts

const clientId = config.clientId
const clientSecret = config.clientSecret
const redirectUri = `http://localhost:${PORT}/callback`
const streamerUserId = config.myChannelUserId

// Use the same scopes your streamer token currently has
const scopes = [
    'channel:manage:broadcast',
    'channel:manage:moderators', 
    'channel:manage:polls',
    'channel:manage:raids',
    'channel:manage:vips',
    'channel:moderate',
    'channel:read:redemptions',
    'channel:read:subscriptions',  // This is what we need
    'channel_commercial',
    'channel_editor',
    'chat:edit',
    'chat:read',
    'moderator:manage:announcements',
    'moderator:manage:automod',
    'moderator:manage:banned_users',
    'moderator:manage:blocked_terms',
    'moderator:manage:chat_messages',
    'moderator:manage:chat_settings',
    'moderator:manage:shield_mode',
    'moderator:manage:shoutouts',
    'moderator:read:blocked_terms',
    'moderator:read:chatters',
    'moderator:read:followers',
    'user:manage:chat_color',
    'user:manage:whispers',
    'user:read:follows',
    'whispers:edit',
    'whispers:read'
].join('+')

console.log('🚀 Starting streamer re-authorization process...')
console.log('📋 This will refresh your streamer token with all existing scopes')

// Generate authorization URL
const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}`

console.log('\n' + '='.repeat(80))
console.log('🔐 STEP 1: Authorize your STREAMER account')
console.log('='.repeat(80))
console.log('1. Open this URL in your browser:')
console.log(`\n   ${authUrl}\n`)
console.log('2. Log in as YOUR STREAMER ACCOUNT (maddeth)')
console.log('3. Click "Authorize" to grant permissions')
console.log('4. You will be redirected back to this script')
console.log('='.repeat(80))

// Handle callback
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
        console.log(`   - Scopes: ${tokenData.scope.length} scopes granted`)

        // Format token data for Twurple
        const formattedTokenData = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
            obtainmentTimestamp: Date.now(),
            scope: tokenData.scope
        }

        // Save the new token
        const tokenFile = `./tokens.${streamerUserId}.json`
        const backupFile = `./tokens.${streamerUserId}.backup.json`

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
        console.log(`💾 New streamer token saved to ${tokenFile}`)

        res.send(`
            <h1>✅ Streamer Re-authorization Complete!</h1>
            <p><strong>Streamer token refreshed successfully!</strong></p>
            <p>Granted scopes: ${tokenData.scope.length} scopes including channel:read:subscriptions</p>
            <p>You can now close this window and stop the script (Ctrl+C)</p>
            <hr>
            <p><small>Token file: ${tokenFile}</small></p>
        `)

        console.log('\n' + '='.repeat(80))
        console.log('🎉 SUCCESS! Streamer re-authorization complete')
        console.log('='.repeat(80))
        console.log('✅ Your streamer token is now fresh and ready')
        console.log('📁 Token saved and ready for subscription checking')
        console.log('🔄 You can now test the subscription lookup again')
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