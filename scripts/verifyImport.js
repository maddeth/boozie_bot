import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/maddeth/bot/.env' });
const sql = neon(process.env.DATABASE_URL);

console.log('=== TOP 10 EGG HOLDERS AFTER IMPORT ===');
const topUsers = await sql('SELECT username, eggs_amount FROM eggs ORDER BY eggs_amount DESC LIMIT 10');
topUsers.forEach((user, i) => {
  console.log(`${i+1}. ${user.username}: ${user.eggs_amount.toLocaleString()} eggs`);
});

console.log('\n=== IMPORT STATISTICS ===');
const stats = await sql('SELECT COUNT(*) as total, SUM(eggs_amount) as total_eggs, AVG(eggs_amount) as avg_eggs FROM eggs WHERE eggs_amount > 0');
console.log(`Total users with eggs: ${stats[0].total}`);
console.log(`Total eggs: ${Number(stats[0].total_eggs).toLocaleString()}`);
console.log(`Average eggs: ${Math.round(Number(stats[0].avg_eggs))}`);

console.log('\n=== COMPARISON WITH OLD DATA ===');
// Check some specific users to see the change
const sampleUsers = await sql(`
  SELECT username, eggs_amount 
  FROM eggs 
  WHERE eggs_amount > 100000 
  ORDER BY eggs_amount DESC 
  LIMIT 5
`);
console.log('High-value users after import:');
sampleUsers.forEach(user => {
  console.log(`- ${user.username}: ${user.eggs_amount.toLocaleString()} eggs`);
});