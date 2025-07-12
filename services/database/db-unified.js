import { neon } from "@neondatabase/serverless"
import pg from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const DATABASE_URL = process.env.DATABASE_URL

console.log('🔗 Database Client Initialization')
console.log('📊 DATABASE_URL:', DATABASE_URL ? 'Found' : 'Not found')

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

// Check if this is a Neon database URL
const isNeonDatabase = DATABASE_URL && DATABASE_URL.includes('neon.tech')

let sql;

if (isNeonDatabase) {
  // Use Neon serverless client for Neon databases
  console.log('🌐 Using Neon serverless client')
  sql = neon(DATABASE_URL)
} else {
  // Use standard PostgreSQL client for local databases
  console.log('🐘 Using standard PostgreSQL client for local database')
  const { Pool } = pg
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('💥 Unexpected error on idle client', err)
  })

  // Create a sql function that mimics the neon client interface
  sql = async (strings, ...values) => {
    // Handle both template literal and direct string calls
    if (typeof strings === 'string') {
      // Direct string query: sql('SELECT * FROM users WHERE id = $1', [1])
      try {
        const result = await pool.query(strings, values)
        return result.rows
      } catch (error) {
        console.error('💥 Database query error:', error.message)
        throw error
      }
    } else if (Array.isArray(strings)) {
      // Template literal syntax: sql`SELECT * FROM users WHERE id = ${id}`
      // Convert template literal to parameterized query
      let query = strings[0]
      const params = []
      
      for (let i = 0; i < values.length; i++) {
        params.push(values[i])
        query += `$${i + 1}${strings[i + 1]}`
      }
      
      try {
        const result = await pool.query(query, params)
        return result.rows
      } catch (error) {
        console.error('💥 Database query error:', error.message)
        console.error('📝 Query:', query)
        console.error('📊 Params:', params)
        throw error
      }
    } else {
      throw new Error('Invalid query format. Use either sql`template` or sql(string, params)')
    }
  }

  // Add transaction support for PostgreSQL
  sql.transaction = async (callback) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // Add connection testing
  sql.testConnection = async () => {
    try {
      const result = await pool.query('SELECT 1 as test')
      return result.rows[0].test === 1
    } catch (error) {
      console.error('🚨 Connection test failed:', error.message)
      return false
    }
  }

  // Graceful shutdown
  sql.close = async () => {
    await pool.end()
    console.log('🔐 Database pool closed')
  }
}

// Test the connection on initialization
if (!isNeonDatabase) {
  sql.testConnection().then(success => {
    if (success) {
      console.log('✅ Database connection test successful')
    } else {
      console.error('❌ Database connection test failed')
    }
  }).catch(error => {
    console.error('💥 Connection test error:', error.message)
  })
}

export default sql