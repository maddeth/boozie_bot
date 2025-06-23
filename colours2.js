import { neon } from "@neondatabase/serverless"
import logger from './logger.js'

const sql = neon(process.env.DATABASE_URL)

export const coloursRowCount2 = async () => {
  try {
    const response = await sql('SELECT count(*) FROM colours')
    return response[0].count
  } catch (error) {
    logger.error('Failed to get colours row count', error)
    return null
  }
}

export async function getRandomColourByName(req) {
  try {
    // Sanitize input and use parameterized query
    const sanitizedReq = req.toString().trim()
    if (!sanitizedReq || sanitizedReq.length === 0) {
      return false
    }
    
    const colourMap = await sql('SELECT colourname FROM colours WHERE colourname ILIKE $1', [`%${sanitizedReq}%`])
    if (colourMap.length > 0) {
      let randomColour = colourMap[Math.floor(Math.random() * colourMap.length)]
      return randomColour.colourname
    }
    return false
  } catch (error) {
    logger.error('Failed to get random colour by name', { searchTerm: req, error })
    return false
  }
}

export const getAllColours = async () => {
  const response = await sql('select * from colours')
  return response
}

export const getById = async (req) => {
  const response = await sql('select * from colours where id = $1', [req])
  return response
}

export const getByColourName = async (req) => {
  try {
    // Sanitize input and use parameterized query
    const sanitizedReq = req.toString().trim()
    if (!sanitizedReq || sanitizedReq.length === 0) {
      return []
    }
    
    const response = await sql('SELECT colourname, hex_value FROM colours WHERE colourname ILIKE $1', [`%${sanitizedReq}%`])
    return response
  } catch (error) {
    logger.error('Failed to get colour by name', { searchTerm: req, error })
    return []
  }
}

export const getColourByHex = async (req) => {
  logger.debug('Looking up colour by hex', { hex: req })
  const response = await sql('SELECT colourname FROM colours where hex_value = $1', [req])
  // const response = await sql(search)
  return response
}

export const getHexByColourName = async (req) => {
  try {
    const response = await sql('select hex_value from colours where colourname = $1', [req])
    return response
  } catch (error) {
    return null
  }
}

export const getByUserName = async (req) => {
  const response = await sql('select * from colours where username = $1', [req])
  return response
}

export const getSpecificColourById = async (req) => {
  try {
    const response = await sql('SELECT colourname FROM colours where id=$1', [req])
    return response
  } catch (error) {
    return null
  }
}

export const getLastColour = async () => {
  try {
    const response = await sql('select * from colours order by id desc limit 1')
    return response
  } catch (error) {
    return null
  }
}

export const addColour = async (colour, hex, user) => {
  try {
    await sql('INSERT INTO colours (colourname, hex_value, username) VALUES ($1, $2, $3)', [colour, hex, user])
    return user + " added " + colour + " with hex of " + hex
  } catch (error) {
    if (error.toString().includes("duplicate key value violates unique constraint")) {
      return "Colour already exists"
    } else {
      return "Error adding colour " + error.toString()
    }
  }
}
