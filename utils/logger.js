import winston from 'winston'

const { combine, timestamp, errors, json, printf, colorize } = winston.format

// Custom format for development
const devFormat = printf(({ level, message, timestamp, service, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
  return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`
})

// Production format (JSON for k8s log aggregation)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
)

// Development format (human readable)
const developmentFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  devFormat
)

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : developmentFormat,
  defaultMeta: { 
    service: 'boozie-bot',
    version: '2.0.0'
  },
  transports: [
    new winston.transports.Console()
  ]
})

// Add file transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'bot.log',
    level: 'debug'
  }))
}

export default logger