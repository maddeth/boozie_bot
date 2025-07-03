import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import logger from '../utils/logger.js'

class WebSocketService {
  constructor(port) {
    this.connectedClients = {}
    this.wss = new WebSocketServer({ port })
    this.heartbeatInterval = 30000 // 30 seconds
    this.heartbeatTimer = null
    
    // Connection limits
    this.maxConnectionsPerIP = 5
    this.maxTotalConnections = 100
    this.connectionsByIP = new Map()
    
    // Rate limiting
    this.connectionAttempts = new Map() // IP -> { count, firstAttempt }
    this.rateLimitWindow = 60000 // 1 minute
    this.maxConnectionAttemptsPerWindow = 10
    this.rateLimitCleanupTimer = null
    
    // Message batching
    this.messageQueue = []
    this.batchInterval = 50 // 50ms batching window
    this.batchTimer = null
    this.maxBatchSize = 10 // Max messages per batch
    
    this.init()
  }

  init() {
    this.wss.on('connection', (ws, req) => {
      const clientIP = this.getClientIP(req)
      
      // Check rate limiting
      if (!this.checkRateLimit(clientIP)) {
        logger.warn('WebSocket connection rejected due to rate limit', { clientIP })
        ws.close(1008, 'Rate limit exceeded')
        return
      }
      
      // Check total connection limit
      if (Object.keys(this.connectedClients).length >= this.maxTotalConnections) {
        logger.warn('WebSocket connection rejected due to max connections', { 
          clientIP, 
          currentConnections: Object.keys(this.connectedClients).length 
        })
        ws.close(1008, 'Server at capacity')
        return
      }
      
      // Check per-IP connection limit
      const ipConnections = this.connectionsByIP.get(clientIP) || 0
      if (ipConnections >= this.maxConnectionsPerIP) {
        logger.warn('WebSocket connection rejected due to per-IP limit', { 
          clientIP, 
          ipConnections 
        })
        ws.close(1008, 'Too many connections from this IP')
        return
      }
      
      const clientId = uuidv4()
      this.connectedClients[clientId] = {
        socket: ws,
        isAlive: true,
        lastPong: Date.now(),
        ip: clientIP
      }
      
      // Update IP connection count
      this.connectionsByIP.set(clientIP, ipConnections + 1)
      
      logger.debug('WebSocket client connected', { clientId, clientIP, totalClients: Object.keys(this.connectedClients).length })

      // Set up ping-pong handlers
      ws.on('pong', () => {
        const client = this.connectedClients[clientId]
        if (client) {
          client.isAlive = true
          client.lastPong = Date.now()
        }
      })

      ws.on('message', (data) => {
        logger.debug('WebSocket message received', { clientId, data: data.toString() })
        
        // Handle client-initiated ping
        try {
          const message = JSON.parse(data.toString())
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
          }
        } catch (e) {
          // Not JSON or not a ping message, ignore
        }
      })

      ws.on('close', () => {
        logger.debug('WebSocket client disconnected', { clientId })
        this.removeClient(clientId)
      })

      ws.on('error', (error) => {
        logger.error('WebSocket client error', { clientId, error })
        this.removeClient(clientId)
      })
    })

    // Start heartbeat mechanism
    this.startHeartbeat()
    
    // Start rate limit cleanup
    this.startRateLimitCleanup()

    logger.info('WebSocket server initialized', { port: this.wss.options.port })
  }

  broadcast(data) {
    // Add message to queue
    this.messageQueue.push(data)
    
    // If batch is full, send immediately
    if (this.messageQueue.length >= this.maxBatchSize) {
      this.flushMessageQueue()
      return
    }
    
    // Otherwise, schedule batch send if not already scheduled
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushMessageQueue()
      }, this.batchInterval)
    }
  }

  flushMessageQueue() {
    if (this.messageQueue.length === 0) {
      return
    }
    
    // Clear the timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    
    // Prepare batch message
    const batch = this.messageQueue.splice(0, this.maxBatchSize)
    const message = JSON.stringify({
      type: 'batch',
      messages: batch,
      count: batch.length
    })
    
    const clientCount = Object.keys(this.connectedClients).length
    logger.debug('Broadcasting batch to WebSocket clients', { 
      clientCount, 
      batchSize: batch.length,
      messageTypes: batch.map(m => m.type)
    })

    // Send to all connected clients
    for (const clientId in this.connectedClients) {
      const client = this.connectedClients[clientId]
      if (client && client.socket && client.socket.readyState === client.socket.OPEN) {
        try {
          client.socket.send(message)
        } catch (error) {
          logger.error('Failed to send WebSocket message', { clientId, error })
          this.removeClient(clientId)
        }
      } else {
        this.removeClient(clientId)
      }
    }
    
    // If there are more messages, schedule another flush
    if (this.messageQueue.length > 0) {
      this.batchTimer = setTimeout(() => {
        this.flushMessageQueue()
      }, this.batchInterval)
    }
  }

  broadcastImmediate(data) {
    // Send message immediately without batching (for high-priority messages)
    const message = JSON.stringify(data)
    const clientCount = Object.keys(this.connectedClients).length
    
    logger.debug('Broadcasting immediate message to WebSocket clients', { clientCount, data })

    for (const clientId in this.connectedClients) {
      const client = this.connectedClients[clientId]
      if (client && client.socket && client.socket.readyState === client.socket.OPEN) {
        try {
          client.socket.send(message)
        } catch (error) {
          logger.error('Failed to send WebSocket message', { clientId, error })
          this.removeClient(clientId)
        }
      } else {
        this.removeClient(clientId)
      }
    }
  }

  getConnectedClientsCount() {
    return Object.keys(this.connectedClients).length
  }

  getConnectionStats() {
    const stats = {
      totalConnections: Object.keys(this.connectedClients).length,
      connectionsByIP: {},
      uniqueIPs: this.connectionsByIP.size,
      limits: {
        maxConnectionsPerIP: this.maxConnectionsPerIP,
        maxTotalConnections: this.maxTotalConnections,
        rateLimitWindow: this.rateLimitWindow,
        maxConnectionAttemptsPerWindow: this.maxConnectionAttemptsPerWindow
      }
    }
    
    // Get connection count per IP
    for (const [ip, count] of this.connectionsByIP.entries()) {
      stats.connectionsByIP[ip] = count
    }
    
    return stats
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      let disconnectedCount = 0

      for (const clientId in this.connectedClients) {
        const client = this.connectedClients[clientId]
        
        if (!client.isAlive) {
          // Client didn't respond to last ping, terminate connection
          logger.debug('Terminating unresponsive WebSocket client', { 
            clientId, 
            lastPong: new Date(client.lastPong).toISOString() 
          })
          client.socket.terminate()
          this.removeClient(clientId)
          disconnectedCount++
        } else {
          // Mark as not alive and send ping
          client.isAlive = false
          client.socket.ping()
        }
      }

      if (disconnectedCount > 0) {
        logger.info('Cleaned up unresponsive WebSocket clients', { 
          disconnectedCount, 
          remainingClients: this.getConnectedClientsCount() 
        })
      }
    }, this.heartbeatInterval)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  startRateLimitCleanup() {
    // Clean up old rate limit entries every 5 minutes
    this.rateLimitCleanupTimer = setInterval(() => {
      const now = Date.now()
      let cleaned = 0
      
      for (const [ip, attempts] of this.connectionAttempts.entries()) {
        if (now - attempts.firstAttempt > this.rateLimitWindow) {
          this.connectionAttempts.delete(ip)
          cleaned++
        }
      }
      
      if (cleaned > 0) {
        logger.debug('Cleaned up rate limit entries', { cleaned })
      }
    }, 300000) // 5 minutes
  }

  stopRateLimitCleanup() {
    if (this.rateLimitCleanupTimer) {
      clearInterval(this.rateLimitCleanupTimer)
      this.rateLimitCleanupTimer = null
    }
  }

  getClientIP(req) {
    // Get IP from various headers (for proxy/CDN scenarios)
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    return req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           'unknown'
  }

  checkRateLimit(ip) {
    const now = Date.now()
    const attempts = this.connectionAttempts.get(ip)
    
    if (!attempts) {
      this.connectionAttempts.set(ip, { count: 1, firstAttempt: now })
      return true
    }
    
    // Reset if outside window
    if (now - attempts.firstAttempt > this.rateLimitWindow) {
      this.connectionAttempts.set(ip, { count: 1, firstAttempt: now })
      return true
    }
    
    // Check if within limit
    attempts.count++
    return attempts.count <= this.maxConnectionAttemptsPerWindow
  }

  removeClient(clientId) {
    const client = this.connectedClients[clientId]
    if (client) {
      // Decrement IP connection count
      const ipCount = this.connectionsByIP.get(client.ip) || 0
      if (ipCount <= 1) {
        this.connectionsByIP.delete(client.ip)
      } else {
        this.connectionsByIP.set(client.ip, ipCount - 1)
      }
      
      delete this.connectedClients[clientId]
    }
  }

  close() {
    // Flush any pending messages before closing
    if (this.messageQueue.length > 0) {
      this.flushMessageQueue()
    }
    
    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    
    this.stopHeartbeat()
    this.stopRateLimitCleanup()
    this.wss.close()
    logger.info('WebSocket server closed')
  }
}

export default WebSocketService