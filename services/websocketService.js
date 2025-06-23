import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import logger from '../logger.js'

class WebSocketService {
  constructor(port) {
    this.connectedClients = {}
    this.wss = new WebSocketServer({ port })
    this.init()
  }

  init() {
    this.wss.on('connection', (ws) => {
      const clientId = uuidv4()
      this.connectedClients[clientId] = ws
      
      logger.debug('WebSocket client connected', { clientId })

      ws.on('message', (data) => {
        logger.debug('WebSocket message received', { clientId, data: data.toString() })
      })

      ws.on('close', () => {
        logger.debug('WebSocket client disconnected', { clientId })
        delete this.connectedClients[clientId]
      })

      ws.on('error', (error) => {
        logger.error('WebSocket client error', { clientId, error })
        delete this.connectedClients[clientId]
      })
    })

    logger.info('WebSocket server initialized', { port: this.wss.options.port })
  }

  broadcast(data) {
    const message = JSON.stringify(data)
    const clientCount = Object.keys(this.connectedClients).length
    
    logger.debug('Broadcasting to WebSocket clients', { clientCount, data })

    for (const clientId in this.connectedClients) {
      const client = this.connectedClients[clientId]
      if (client && client.readyState === client.OPEN) {
        try {
          client.send(message)
        } catch (error) {
          logger.error('Failed to send WebSocket message', { clientId, error })
          delete this.connectedClients[clientId]
        }
      } else {
        delete this.connectedClients[clientId]
      }
    }
  }

  getConnectedClientsCount() {
    return Object.keys(this.connectedClients).length
  }

  close() {
    this.wss.close()
    logger.info('WebSocket server closed')
  }
}

export default WebSocketService