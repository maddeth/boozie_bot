import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL)

export const coloursRowCount2 = async () => {
  try {
    const response = await sql('SELECT count(*) FROM colours')
    return response[0].count
  } catch (error) {
    console.log(error)
    return null
  }
}

export async function getRandomColourByName(req) {
  const search = `select colourname from colours where colourname like '%${req}%';`
  let colourMap = await sql(search)
  if (colourMap.length > 0) {
    let randomColour = colourMap[Math.floor(Math.random() * colourMap.length)]
    return randomColour.colourname
  }
  return false;
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
  const search = `select colourname, hex_value from colours where colourname like '%${req}%';`
  const response = await sql(search)
  return response
}

export const getColourByHex = async (req) => {
  console.log(req)
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
