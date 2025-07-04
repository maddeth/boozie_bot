import express from 'express'
import { QuotesService } from '../../database/quotesService.js'
import { authenticateToken } from '../../../middleware/auth.js'
import { checkModeratorRole } from '../../../middleware/checkRole.js'
import logger from '../../../utils/logger.js'

const router = express.Router()

// Get all quotes (public)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const search = req.query.search || ''
    
    let result
    if (search) {
      result = await QuotesService.searchQuotes(search, page, limit)
    } else {
      result = await QuotesService.getAllQuotes(page, limit)
    }
    
    res.json(result)
  } catch (error) {
    logger.error('Error fetching quotes:', error)
    res.status(500).json({ error: 'Failed to fetch quotes' })
  }
})

// Get random quote (public)
router.get('/random', async (req, res) => {
  try {
    const quote = await QuotesService.getRandomQuote()
    
    if (!quote) {
      return res.status(404).json({ error: 'No quotes found' })
    }
    
    res.json(quote)
  } catch (error) {
    logger.error('Error fetching random quote:', error)
    res.status(500).json({ error: 'Failed to fetch random quote' })
  }
})

// Get quote by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid quote ID' })
    }
    
    const quote = await QuotesService.getQuoteById(id)
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' })
    }
    
    res.json(quote)
  } catch (error) {
    logger.error('Error fetching quote:', error)
    res.status(500).json({ error: 'Failed to fetch quote' })
  }
})

// Add new quote (moderator only)
router.post('/', authenticateToken, checkModeratorRole, async (req, res) => {
  try {
    const { quote_text, quoted_by } = req.body
    
    if (!quote_text || !quoted_by) {
      return res.status(400).json({ error: 'Quote text and author are required' })
    }
    
    const quote = await QuotesService.addQuote(
      quote_text,
      quoted_by,
      req.userRole.username,
      req.userRole.twitch_user_id
    )
    
    res.status(201).json(quote)
  } catch (error) {
    logger.error('Error adding quote:', error)
    res.status(500).json({ error: 'Failed to add quote' })
  }
})

// Update quote (moderator only)
router.put('/:id', authenticateToken, checkModeratorRole, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { quote_text, quoted_by } = req.body
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid quote ID' })
    }
    
    if (!quote_text || !quoted_by) {
      return res.status(400).json({ error: 'Quote text and author are required' })
    }
    
    const quote = await QuotesService.updateQuote(id, quote_text, quoted_by)
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' })
    }
    
    res.json(quote)
  } catch (error) {
    logger.error('Error updating quote:', error)
    res.status(500).json({ error: 'Failed to update quote' })
  }
})

// Delete quote (moderator only)
router.delete('/:id', authenticateToken, checkModeratorRole, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid quote ID' })
    }
    
    const quote = await QuotesService.deleteQuote(id)
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' })
    }
    
    res.json({ message: 'Quote deleted successfully' })
  } catch (error) {
    logger.error('Error deleting quote:', error)
    res.status(500).json({ error: 'Failed to delete quote' })
  }
})

// Get quotes by user (public)
router.get('/user/:username', async (req, res) => {
  try {
    const username = req.params.username
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    
    const result = await QuotesService.getQuotesByUser(username, page, limit)
    
    res.json(result)
  } catch (error) {
    logger.error('Error fetching user quotes:', error)
    res.status(500).json({ error: 'Failed to fetch user quotes' })
  }
})

// Get quote count (public)
router.get('/stats/count', async (req, res) => {
  try {
    const count = await QuotesService.getQuoteCount()
    res.json({ count })
  } catch (error) {
    logger.error('Error fetching quote count:', error)
    res.status(500).json({ error: 'Failed to fetch quote count' })
  }
})

export default router