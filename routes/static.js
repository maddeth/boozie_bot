import express from 'express'

const router = express.Router()

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