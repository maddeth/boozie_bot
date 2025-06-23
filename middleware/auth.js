import pkg from 'jsonwebtoken'
import logger from '../logger.js'

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

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET)
    return decoded
  } catch (err) {
    logger.error('JWT verification failed', err)
    return null
  }
}