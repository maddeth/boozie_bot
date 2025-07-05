import pg from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })

const { Pool } = pg

// Parse DATABASE_URL
const connectionString = process.env.DATABASE_URL

// Create a connection pool
const pool = new Pool({
  connectionString,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
})

// Create a sql function that mimics the neon client interface
const sql = async (strings, ...values) => {
  // Handle template literal syntax
  let query = strings[0]
  for (let i = 0; i < values.length; i++) {
    query += `$${i + 1}${strings[i + 1]}`
  }
  
  try {
    const result = await pool.query(query, values)
    return result.rows
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Add transaction support
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

export default sql