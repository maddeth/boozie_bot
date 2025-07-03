-- Egg Schema for BoozieBot PostgreSQL Database
-- This creates the eggs table in the same database as colors

CREATE TABLE IF NOT EXISTS eggs (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  username_sanitised VARCHAR(255) UNIQUE NOT NULL,
  eggs_amount INTEGER DEFAULT 0 NOT NULL,
  twitch_user_id VARCHAR(50),  -- Store Twitch user ID for better tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_eggs_username_sanitised ON eggs(username_sanitised);
CREATE INDEX IF NOT EXISTS idx_eggs_eggs_amount ON eggs(eggs_amount);
CREATE INDEX IF NOT EXISTS idx_eggs_twitch_user_id ON eggs(twitch_user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_eggs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at on row updates
DROP TRIGGER IF EXISTS update_eggs_updated_at ON eggs;
CREATE TRIGGER update_eggs_updated_at
    BEFORE UPDATE ON eggs
    FOR EACH ROW
    EXECUTE PROCEDURE update_eggs_updated_at();