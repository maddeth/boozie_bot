import express from 'express'
import logger from '../logger.js'
import { getAllColours, getByColourName, getColourByHex, getByUserName, getLastColour, addColour } from '../colours2.js'
import { checkAuth } from '../middleware/auth.js'

const router = express.Router()

router.post('/', (req, res) => {
  logger.debug('API test endpoint called', { body: req.body })
  res.status(200).json({ result: req.body.text })
})

router.get('/colours', async (req, res) => {
  const auth = checkAuth(req)

  if (auth.aud == "authenticated") {
    const response = await getAllColours()
    res.status(200).json(response)
  } else {
    res.status(401).json(auth)
  }
})

router.post('/colours', async (req, res) => {
  const auth = checkAuth(req)

  if (auth.aud == "authenticated") {
    const user = auth.user_metadata.nickname
    const colour = req.body.colour.toLowerCase().match(/[0-9a-z\s]{0,60}/g)[0].trim()
    const hex = req.body.hex.toUpperCase().match(/[0-9A-F]{6}/g)[0].trim()
    try {
      const addColourResponse = await addColour(colour, hex, user)
      res.status(200).json(addColourResponse)
      return
    } catch (error) {
      logger.error('Error adding colour', error)
      res.status(200).json(error)
    }
  } else {
    res.status(401).json(auth)
  }
})

router.get('/colours/username', async (req, res) => {
  const auth = checkAuth(req)
  const user = auth.user_metadata.nickname

  if (auth.aud == "authenticated") {
    const response = await getByUserName(user)
    res.status(200).json(response)
  } else {
    res.status(401).json(auth)
  }
})

router.post('/colours/username', async (req, res) => {
  const auth = checkAuth(req)
  const user = auth.user_metadata.nickname

  if (auth.aud == "authenticated") {
    if (req.body.username) {
      const response = await getByUserName(req.body.username)
      res.status(200).json(response)
    } else {
      const response = await getByUserName(user)
      res.status(200).json(response)
    }
  } else {
    res.status(401).json(auth)
  }
})

router.post('/colours/hex', async (req, res) => {
  const auth = checkAuth(req)

  if (req.body.hasOwnProperty('hex')) {
    const hex = req.body.hex.toUpperCase().match(/[0-9A-F]{6}/g)[0].trim()

    if (auth.aud == "authenticated") {
      const response = await getColourByHex(hex)
      res.status(200).json(response)
    } else {
      res.status(401).json(auth)
    }
  } else {
    res.status(200).json({ "Error": "hex not supplied" })
  }
})

router.post('/colours/colourName', async (req, res) => {
  const auth = checkAuth(req)

  if (req.body.hasOwnProperty('colour')) {
    const colour = req.body.colour.toLowerCase().match(/[0-9a-z\s]{0,60}/g)[0].trim()

    if (auth.aud == "authenticated") {
      const response = await getByColourName(colour)
      res.status(200).json(response)
    } else {
      res.status(401).json(auth)
    }
  } else {
    res.status(200).json({ "Error": "hex not supplied" })
  }
})

router.get('/colours/getLastColour', async (req, res) => {
  const auth = checkAuth(req)
  if (auth.aud == "authenticated") {
    const response = await getLastColour()
    res.status(200).json(response)
  } else {
    res.status(401).json(auth)
  }
})

export default router