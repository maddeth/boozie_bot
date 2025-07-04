import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/maddeth/bot/.env' });
const sql = neon(process.env.DATABASE_URL);

const topUsers = await sql('SELECT username, eggs_amount FROM eggs ORDER BY eggs_amount DESC LIMIT 5');
console.log('=== CURRENT TOP 5 ===');
topUsers.forEach((user, i) => {
  console.log(`${i+1}. ${user.username}: ${user.eggs_amount.toLocaleString()} eggs`);
});

// Check specific users from users.json
const rednight = await sql('SELECT eggs_amount FROM eggs WHERE username = $1', ['rednight972']);
const maddeth = await sql('SELECT eggs_amount FROM eggs WHERE username = $1', ['maddeth']);
console.log('\n=== KEY USER CHECK ===');
console.log(`rednight972: ${rednight[0]?.eggs_amount || 'not found'} (should be 159,921)`);
console.log(`maddeth: ${maddeth[0]?.eggs_amount || 'not found'} (should be 38,474)`);