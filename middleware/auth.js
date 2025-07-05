import pkg from 'jsonwebtoken'
import logger from '../utils/logger.js'

const jwt = pkg

export function checkAuth(request) {
  const authHeader = request.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or invalid Authorization header', { 
      ip: request.ip,
      userAgent: request.get('User-Agent')
    })
    return "error: 'Unauthorized: Missing or invalid Authorization header'"
  }

  const token = authHeader.split(' ')[1]
  const decoded = verifyToken(token)

  if (!decoded) {
    logger.warn('Invalid JWT token', { 
      ip: request.ip,
      userAgent: request.get('User-Agent')
    })
    return "error: 'Unauthorized: Invalid token'"
  }
  
  logger.debug('User authenticated', { 
    userId: decoded.sub,
    email: decoded.email
  })
  
  return decoded
}

export function authenticateToken(req, res, next) {
  const authHeader = req.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or invalid Authorization header', { 
      ip: req.ip,
      userAgent: req.get('User-Agent')
    })
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    })
  }

  const token = authHeader.split(' ')[1]
  const decoded = verifyToken(token)

  if (!decoded) {
    logger.warn('Invalid JWT token', { 
      ip: req.ip,
      userAgent: req.get('User-Agent')
    })
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid token'
    })
  }
  
  req.user = decoded
  console.log('🔍 Auth middleware - decoded token:', typeof decoded.sub, JSON.stringify(decoded.sub))
  logger.debug('User authenticated via middleware', { 
    userId: decoded.sub,
    email: decoded.email
  })
  
  next()
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET)
    return decoded
  } catch (err) {
    logger.error('JWT verification failed', err)
    return null
  }
}