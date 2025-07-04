import sql from './db.js'
import logger from '../../utils/logger.js'

export class QuotesService {
  /**
   * Add a new quote
   */
  static async addQuote(quoteText, quotedBy, addedBy, addedById = null) {
    try {
      const result = await sql(
        `INSERT INTO quotes (quote_text, quoted_by, added_by, added_by_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [quoteText, quotedBy, addedBy, addedById]
      )
      
      logger.info(`Quote added: #${result[0].id} by ${addedBy}`)
      return result[0]
    } catch (error) {
      logger.error('Error adding quote:', error)
      throw error
    }
  }

  /**
   * Get a random quote
   */
  static async getRandomQuote() {
    try {
      const result = await sql(
        `SELECT * FROM quotes 
         WHERE deleted = false 
         ORDER BY RANDOM() 
         LIMIT 1`
      )
      
      return result[0] || null
    } catch (error) {
      logger.error('Error getting random quote:', error)
      throw error
    }
  }

  /**
   * Get quote by ID
   */
  static async getQuoteById(id) {
    try {
      const result = await sql(
        `SELECT * FROM quotes 
         WHERE id = $1 AND deleted = false`,
        [id]
      )
      
      return result[0] || null
    } catch (error) {
      logger.error('Error getting quote by ID:', error)
      throw error
    }
  }

  /**
   * Get all quotes (paginated)
   */
  static async getAllQuotes(page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit
      
      const [quotes, countResult] = await Promise.all([
        sql(
          `SELECT * FROM quotes 
           WHERE deleted = false 
           ORDER BY id DESC 
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
        sql(`SELECT COUNT(*) as total FROM quotes WHERE deleted = false`)
      ])
      
      return {
        quotes,
        total: parseInt(countResult[0].total),
        page,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    } catch (error) {
      logger.error('Error getting all quotes:', error)
      throw error
    }
  }

  /**
   * Search quotes
   */
  static async searchQuotes(searchTerm, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit
      const searchPattern = `%${searchTerm}%`
      
      const [quotes, countResult] = await Promise.all([
        sql(
          `SELECT * FROM quotes 
           WHERE deleted = false 
           AND (quote_text ILIKE $1 OR quoted_by ILIKE $1)
           ORDER BY id DESC 
           LIMIT $2 OFFSET $3`,
          [searchPattern, limit, offset]
        ),
        sql(
          `SELECT COUNT(*) as total FROM quotes 
           WHERE deleted = false 
           AND (quote_text ILIKE $1 OR quoted_by ILIKE $1)`,
          [searchPattern]
        )
      ])
      
      return {
        quotes,
        total: parseInt(countResult[0].total),
        page,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    } catch (error) {
      logger.error('Error searching quotes:', error)
      throw error
    }
  }

  /**
   * Delete quote (soft delete)
   */
  static async deleteQuote(id) {
    try {
      const result = await sql(
        `UPDATE quotes 
         SET deleted = true, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING *`,
        [id]
      )
      
      if (result.length === 0) {
        return null
      }
      
      logger.info(`Quote #${id} deleted`)
      return result[0]
    } catch (error) {
      logger.error('Error deleting quote:', error)
      throw error
    }
  }

  /**
   * Update quote
   */
  static async updateQuote(id, quoteText, quotedBy) {
    try {
      const result = await sql(
        `UPDATE quotes 
         SET quote_text = $2, quoted_by = $3, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND deleted = false 
         RETURNING *`,
        [id, quoteText, quotedBy]
      )
      
      if (result.length === 0) {
        return null
      }
      
      logger.info(`Quote #${id} updated`)
      return result[0]
    } catch (error) {
      logger.error('Error updating quote:', error)
      throw error
    }
  }

  /**
   * Get quote count
   */
  static async getQuoteCount() {
    try {
      const result = await sql(`SELECT COUNT(*) as total FROM quotes WHERE deleted = false`)
      return parseInt(result[0].total)
    } catch (error) {
      logger.error('Error getting quote count:', error)
      throw error
    }
  }

  /**
   * Get quotes by user
   */
  static async getQuotesByUser(username, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit
      
      const [quotes, countResult] = await Promise.all([
        sql(
          `SELECT * FROM quotes 
           WHERE deleted = false AND quoted_by = $1
           ORDER BY id DESC 
           LIMIT $2 OFFSET $3`,
          [username, limit, offset]
        ),
        sql(
          `SELECT COUNT(*) as total FROM quotes 
           WHERE deleted = false AND quoted_by = $1`,
          [username]
        )
      ])
      
      return {
        quotes,
        total: parseInt(countResult[0].total),
        page,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    } catch (error) {
      logger.error('Error getting quotes by user:', error)
      throw error
    }
  }
}