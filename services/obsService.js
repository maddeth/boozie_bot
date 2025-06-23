import OBSWebSocket from 'obs-websocket-js'
import logger from '../logger.js'
import config from '../config.json' with { type: "json" }

class OBSService {
  constructor() {
    this.obs = new OBSWebSocket()
    this.obsPassword = config.obsPassword
    this.obsIP = config.obsIP
  }

  async changeColour(colour) {
    try {
      const {
        obsWebSocketVersion,
        negotiatedRpcVersion
      } = await this.obs.connect(this.obsIP, this.obsPassword, {
        rpcVersion: 1
      })
      logger.info('OBS WebSocket connected', { version: obsWebSocketVersion, rpcVersion: negotiatedRpcVersion })
    } catch (error) {
      logger.error('OBS WebSocket connection failed', { code: error.code, message: error.message })
      throw error
    }

    const hexToDecimal = hex => parseInt(hex, 16)
    logger.debug('Processing colour change', { inputColour: colour })
    
    let arrayOfHex = colour.match(/.{1,2}/g)
    let obsHexOrder = arrayOfHex.reverse().join("")
    let finalHex = "ff" + obsHexOrder
    const obsDecimalColour = hexToDecimal(finalHex)

    let myObject = {
      color: obsDecimalColour
    }

    try {
      await this.obs.call('SetSourceFilterSettings', { 
        sourceName: 'Webcam shadow', 
        filterName: 'colour', 
        filterSettings: myObject 
      })
      await this.obs.call('SetSourceFilterSettings', { 
        sourceName: 'Muse Shadow', 
        filterName: 'colour', 
        filterSettings: myObject 
      })
      await this.obs.disconnect()
      
      logger.info('OBS colour updated successfully', { colour, obsDecimalColour })
    } catch (error) {
      logger.error('OBS filter update failed', { code: error.code, message: error.message })
      throw error
    }
  }

  async isConnected() {
    try {
      await this.obs.connect(this.obsIP, this.obsPassword, { rpcVersion: 1 })
      await this.obs.disconnect()
      return true
    } catch (error) {
      return false
    }
  }
}

export default OBSService