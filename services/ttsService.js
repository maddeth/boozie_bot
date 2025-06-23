import { promises as fs } from 'fs'
import fetch from 'node-fetch'
import { v4 as uuidv4 } from 'uuid'
import logger from '../logger.js'

class TTSService {
  constructor() {
    this.ttsDirectory = '/home/html/tts'
  }

  async generateTTS(text) {
    try {
      const url = `https://api.streamelements.com/kappa/v2/speech?voice=Geraint&text=${encodeURI(text)}`
      const result = await fetch(url, { method: 'GET' })
      const buffer = await result.buffer()
      return buffer
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