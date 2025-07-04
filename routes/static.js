import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Serve the dashboard
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// Moderator-only page
router.get('/moderator', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// Serve config file
router.get('/config.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/config.js'))
})

router.get('/', (req, res) => {
  res.redirect(301, 'https://www.twitch.tv/maddeth')
})

router.get('/login', (req, res) => {
  res.sendFile("/home/html/login.html")
  res.status(200)
})

router.get('/tts/:id', (req, res) => {
  let audioFilePath = `/home/html/tts/${req.params.id}.mp3`
  res.sendFile(audioFilePath)
})

export default router