import { neon } from "@neondatabase/serverless"
import pg from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const DATABASE_URL = process.env.DATABASE_URL

console.log('DATABASE_URL:', DATABASE_URL ? 'Found' : 'Not found')
console.log('DATABASE_URL preview:', DATABASE_URL ? DATABASE_URL.substring(0, 30) + '...' : 'undefined')

// Check if this is a Neon database URL
const isNeonDatabase = DATABASE_URL && DATABASE_URL.includes('neon.tech')

let sql;

if (isNeonDatabase) {
  // Use Neon serverless client for Neon databases
  console.log('Using Neon serverless client')
  sql = neon(DATABASE_URL)
} else {
  // Use standard PostgreSQL client for local databases
  console.log('Using standard PostgreSQL client for local database')
  const { Pool } = pg

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  // Create a sql function that mimics the neon client interface
  sql = async (strings, ...values) => {
    // Handle both template literal and direct string calls
    if (typeof strings === 'string') {
      // Direct string query: sql('SELECT * FROM users WHERE id = $1', [1])
      // Handle case where values is an array passed as single parameter
      let actualValues = values
      if (values.length === 1 && Array.isArray(values[0])) {
        actualValues = values[0]
      }

      // Clean up parameters that might be wrapped in objects
      const cleanValues = actualValues.map(value => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const keys = Object.keys(value)
          if (keys.length === 1) {
            return value[keys[0]]
          }
        }
        return value
      })

      try {
        const result = await pool.query(strings, cleanValues)
        return result.rows
      } catch (error) {
        console.error('Database query error:', error)
        console.error('Original values:', JSON.stringify(values))
        console.error('Actual values:', JSON.stringify(actualValues))
        console.error('Cleaned values:', JSON.stringify(cleanValues))
        throw error
      }
    } else if (Array.isArray(strings)) {
      // Template literal syntax: sql`SELECT * FROM users WHERE id = ${id}`
      // Convert template literal to parameterized query
      let query = strings[0]
      const params = []

      for (let i = 0; i < values.length; i++) {
        // Extract the actual value, handling case where it might be wrapped
        let value = values[i]

        // If value is an object with a single property, unwrap it
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const keys = Object.keys(value)
          if (keys.length === 1) {
            value = value[keys[0]]
          }
        }

        params.push(value)
        query += `$${i + 1}${strings[i + 1]}`
      }

      try {
        const result = await pool.query(query, params)
        return result.rows
      } catch (error) {
        console.error('Database query error:', error)
        throw error
      }
    } else {
      throw new Error('Invalid query format. Use either sql`template` or sql(string, params)')
    }
  }
}

export default sql