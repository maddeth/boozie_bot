-- Users table for centralized user management and role tracking
-- This table will store user information and their privileges

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    twitch_user_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255),
    supabase_user_id UUID,
    
    -- Role and privilege columns
    is_moderator BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    is_vip BOOLEAN DEFAULT FALSE,
    is_subscriber BOOLEAN DEFAULT FALSE,
    subscription_tier VARCHAR(10) DEFAULT '0', -- '0', '1000', '2000', '3000'
    
    -- Privilege timestamps for tracking changes
    moderator_since TIMESTAMP NULL,
    moderator_updated TIMESTAMP NULL,
    subscription_updated TIMESTAMP NULL,
    
    -- Standard timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_twitch_id ON users(twitch_user_id);
CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_moderator ON users(is_moderator);

-- Update trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Comments for documentation
COMMENT ON TABLE users IS 'Central user management table linking Twitch users with Supabase auth and tracking privileges';
COMMENT ON COLUMN users.twitch_user_id IS 'Unique Twitch user ID from Twitch API';
COMMENT ON COLUMN users.supabase_user_id IS 'UUID from Supabase Auth, nullable for users who havent logged in to website';
COMMENT ON COLUMN users.subscription_tier IS 'Twitch subscription tier: 0=none, 1000=tier1, 2000=tier2, 3000=tier3';
COMMENT ON COLUMN users.moderator_since IS 'Timestamp when user first became a moderator';
COMMENT ON COLUMN users.moderator_updated IS 'Timestamp when moderator status was last updated';