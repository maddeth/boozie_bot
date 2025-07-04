import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/maddeth/bot/.env' });
const sql = neon(process.env.DATABASE_URL);

console.log('=== CHECKING FOR INVISIBLE CHARACTERS ===');

// Find users with potential invisible characters
const allUsers = await sql('SELECT id, username, username_sanitised, eggs_amount FROM eggs ORDER BY eggs_amount DESC LIMIT 20');

console.log('Top 20 users with character analysis:');
allUsers.forEach((user, i) => {
  const username = user.username;
  const hasInvisible = username !== username.trim() || /[\u200B-\u200D\uFEFF\u00A0\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uF3A0]/g.test(username);
  const cleanName = username.replace(/[\u200B-\u200D\uFEFF\u00A0\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uF3A0]/g, '').trim();
  
  console.log(`${i+1}. "${username}" (${username.length} chars) - Clean: "${cleanName}" ${hasInvisible ? '⚠️ HAS INVISIBLE CHARS' : '✅'}`);
  
  if (hasInvisible) {
    console.log(`   Raw bytes: ${Array.from(username).map(c => c.charCodeAt(0).toString(16)).join(' ')}`);
  }
});

// Specifically check musergames
console.log('\n=== MUSERGAMES DETAILED ANALYSIS ===');
const musergames = await sql("SELECT * FROM eggs WHERE username LIKE '%musergames%'");
if (musergames.length > 0) {
  const user = musergames[0];
  console.log(`Username: "${user.username}"`);
  console.log(`Length: ${user.username.length}`);
  console.log(`Sanitised: "${user.username_sanitised}"`);
  console.log(`Char codes:`, Array.from(user.username).map(c => `${c}(${c.charCodeAt(0)})`));
}