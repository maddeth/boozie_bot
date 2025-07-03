-- Add superadmin column to users table
-- This role is for the streamer only and controls bot admin assignments

-- Add the superadmin column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_superadmin ON users(is_superadmin);

-- Add comment for documentation
COMMENT ON COLUMN users.is_superadmin IS 'Superadmin role - streamer only, can manage bot admins';

-- Set maddeth as the superadmin
UPDATE users 
SET is_superadmin = true 
WHERE LOWER(username) = LOWER('maddeth');

-- Show the results
SELECT username, is_moderator, is_admin, is_superadmin 
FROM users 
WHERE is_superadmin = true OR is_admin = true
ORDER BY is_superadmin DESC, is_admin DESC, username;