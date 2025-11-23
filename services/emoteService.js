import axios from 'axios';
import config from '../config.json' with { type: "json" };

class EmoteService {
    constructor() {
        this.emotes = {
            twitch: {
                global: [],
                channel: []
            },
            bttv: {
                global: [],
                channel: []
            },
            seventv: {
                global: [],
                channel: []
            }
        };
        this.emotesMap = new Map(); // Fast lookup map
        this.lastFetch = 0;
        this.CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache
    }

    async fetchTwitchEmotes(channelId, accessToken) {
        try {
            // Fetch global Twitch emotes
            const globalResponse = await axios.get('https://api.twitch.tv/helix/chat/emotes/global', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Client-Id': config.clientId
                }
            });
            
            // Fetch channel-specific Twitch emotes
            const channelResponse = await axios.get(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${channelId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Client-Id': config.clientId
                }
            });

            this.emotes.twitch.global = globalResponse.data.data.map(emote => ({
                name: emote.name,
                id: emote.id,
                url: `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/2.0`,
                provider: 'twitch'
            }));

            this.emotes.twitch.channel = channelResponse.data.data.map(emote => ({
                name: emote.name,
                id: emote.id,
                url: `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/2.0`,
                provider: 'twitch'
            }));

            console.log(`Loaded ${this.emotes.twitch.global.length} global and ${this.emotes.twitch.channel.length} channel Twitch emotes`);
        } catch (error) {
            console.error('Error fetching Twitch emotes:', error);
        }
    }

    async fetchBTTVEmotes(channelId) {
        try {
            // Fetch global BTTV emotes
            const globalResponse = await axios.get('https://api.betterttv.net/3/cached/emotes/global');
            
            // Fetch channel-specific BTTV emotes
            const channelResponse = await axios.get(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);

            this.emotes.bttv.global = globalResponse.data.map(emote => ({
                name: emote.code,
                id: emote.id,
                url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
                provider: 'bttv'
            }));

            if (channelResponse.data.channelEmotes && channelResponse.data.sharedEmotes) {
                const allChannelEmotes = [...channelResponse.data.channelEmotes, ...channelResponse.data.sharedEmotes];
                this.emotes.bttv.channel = allChannelEmotes.map(emote => ({
                    name: emote.code,
                    id: emote.id,
                    url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
                    provider: 'bttv'
                }));
            }

            console.log(`Loaded ${this.emotes.bttv.global.length} global and ${this.emotes.bttv.channel.length} channel BTTV emotes`);
        } catch (error) {
            console.error('Error fetching BTTV emotes:', error);
        }
    }

    async fetch7TVEmotes(channelId) {
        try {
            // Fetch global 7TV emotes
            const globalResponse = await axios.get('https://7tv.io/v3/emote-sets/global');
            
            // Fetch channel-specific 7TV emotes
            const channelResponse = await axios.get(`https://7tv.io/v3/users/twitch/${channelId}`);

            if (globalResponse.data.emotes) {
                this.emotes.seventv.global = globalResponse.data.emotes.map(emote => ({
                    name: emote.name,
                    id: emote.id,
                    url: `https://cdn.7tv.app/emote/${emote.id}/2x.webp`,
                    provider: '7tv'
                }));
            }

            if (channelResponse.data.emote_set && channelResponse.data.emote_set.emotes) {
                this.emotes.seventv.channel = channelResponse.data.emote_set.emotes.map(emote => ({
                    name: emote.name,
                    id: emote.id,
                    url: `https://cdn.7tv.app/emote/${emote.id}/2x.webp`,
                    provider: '7tv'
                }));
            }

            console.log(`Loaded ${this.emotes.seventv.global.length} global and ${this.emotes.seventv.channel.length} channel 7TV emotes`);
        } catch (error) {
            console.error('Error fetching 7TV emotes:', error);
        }
    }

    async loadAllEmotes(channelId, accessToken) {
        const now = Date.now();
        if (now - this.lastFetch < this.CACHE_DURATION) {
            console.log('Using cached emotes');
            return;
        }

        console.log('Fetching emotes from all providers...');
        
        // Fetch from all providers in parallel
        await Promise.all([
            this.fetchTwitchEmotes(channelId, accessToken),
            this.fetchBTTVEmotes(channelId),
            this.fetch7TVEmotes(channelId)
        ]);

        // Build the lookup map
        this.buildEmoteMap();
        this.lastFetch = now;
    }

    buildEmoteMap() {
        this.emotesMap.clear();
        
        // Add all emotes to the map (channel emotes override global ones)
        const allEmotes = [
            ...this.emotes.twitch.global,
            ...this.emotes.bttv.global,
            ...this.emotes.seventv.global,
            ...this.emotes.twitch.channel,
            ...this.emotes.bttv.channel,
            ...this.emotes.seventv.channel
        ];

        for (const emote of allEmotes) {
            this.emotesMap.set(emote.name, emote);
        }

        console.log(`Total emotes loaded: ${this.emotesMap.size}`);
    }

    getAllEmotes() {
        return Array.from(this.emotesMap.values());
    }

    getEmoteByName(name) {
        return this.emotesMap.get(name);
    }

    parseMessage(message) {
        // Split message into words and check each for emotes
        const words = message.split(/\s+/);
        const parsed = [];

        for (const word of words) {
            const emote = this.emotesMap.get(word);
            if (emote) {
                parsed.push({
                    type: 'emote',
                    content: emote
                });
            } else {
                parsed.push({
                    type: 'text',
                    content: word
                });
            }
        }

        return parsed;
    }
}

export default EmoteService;