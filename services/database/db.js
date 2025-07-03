import { neon } from "@neondatabase/serverless"
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '/home/maddeth/bot/.env' })

const sql = neon(process.env.DATABASE_URL)

export default sql