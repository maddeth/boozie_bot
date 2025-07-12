import sql from './services/database/db.js'

console.log('Testing database connection...')

try {
  const result = await sql`SELECT 1 as test`
  console.log('Success!', result)
  process.exit(0)
} catch (error) {
  console.error('Failed:', error.message)
  console.error('Full error:', error)
  process.exit(1)
}