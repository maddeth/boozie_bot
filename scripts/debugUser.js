import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/maddeth/bot/.env' });
const sql = neon(process.env.DATABASE_URL);

const username = 'musergames';

console.log(`=== DEBUGGING USER: ${username} ===`);

// Check all possible variations
const checks = [
  sql('SELECT * FROM eggs WHERE username = $1', [username]),
  sql('SELECT * FROM eggs WHERE LOWER(username) = LOWER($1)', [username]),
  sql('SELECT * FROM eggs WHERE username_sanitised = $1', [username.toLowerCase()]),
  sql('SELECT * FROM eggs WHERE LOWER(username_sanitised) = LOWER($1)', [username]),
  sql("SELECT * FROM eggs WHERE username ILIKE '%musergames%'"),
  sql("SELECT * FROM eggs WHERE username_sanitised ILIKE '%musergames%'")
];

const results = await Promise.all(checks);

console.log('1. Exact username match:', results[0].length > 0 ? results[0][0] : 'Not found');
console.log('2. Case-insensitive username:', results[1].length > 0 ? results[1][0] : 'Not found');
console.log('3. username_sanitised exact:', results[2].length > 0 ? results[2][0] : 'Not found');
console.log('4. username_sanitised case-insensitive:', results[3].length > 0 ? results[3][0] : 'Not found');
console.log('5. Username LIKE pattern:', results[4].length > 0 ? results[4] : 'Not found');
console.log('6. username_sanitised LIKE pattern:', results[5].length > 0 ? results[5] : 'Not found');

// Also check the top 10 to see if musergames is there under a different name
console.log('\n=== TOP 10 USERS ===');
const top10 = await sql('SELECT username, username_sanitised, eggs_amount FROM eggs ORDER BY eggs_amount DESC LIMIT 10');
top10.forEach((user, i) => {
  console.log(`${i+1}. ${user.username} (${user.username_sanitised}): ${user.eggs_amount.toLocaleString()}`);
});