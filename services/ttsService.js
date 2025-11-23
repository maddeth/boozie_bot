import { promises as fs } from 'fs'
import { TextToSpeechClient } from '@google-cloud/text-to-speech'
import { v4 as uuidv4 } from 'uuid'
import logger from '../utils/logger.js'

class TTSService {
  constructor() {
    this.ttsDirectory = '/home/html/tts'
    this.client = new TextToSpeechClient()
  }

  async generateTTS(text) {
    try {
      const request = {
        input: { text },
        voice: {
          languageCode: 'en-GB',
          name: 'en-GB-Chirp3-HD-Enceladus',
          ssmlGender: 'MALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: 0,
          speakingRate: 1.0
        }
      }

      const [response] = await this.client.synthesizeSpeech(request)
      return Buffer.from(response.audioContent)
    } catch (error) {
      logger.error('TTS generation failed', error)
      throw error
    }
  }

  async createTTSFile(message) {
    let buffer = Buffer.from([])

    if (message.length > 0) {
      const result = await this.generateTTS(message)
      if (result) {
        buffer = Buffer.concat([buffer, result])
      }
    }

    const id = uuidv4()
    const filePath = `${this.ttsDirectory}/${id}.mp3`

    try {
      await fs.writeFile(filePath, buffer)
      logger.info('TTS file created', { id, message: message.substring(0, 50), filePath })
      return id
    } catch (error) {
      logger.error('Failed to write TTS file', { id, error })
      throw error
    }
  }

  getTTSFilePath(id) {
    return `${this.ttsDirectory}/${id}.mp3`
  }
}

export default TTSService