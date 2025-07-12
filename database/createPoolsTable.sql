-- Create pools table for shared egg pools
CREATE TABLE IF NOT EXISTS pools (
    id SERIAL PRIMARY KEY,
    pool_name VARCHAR(255) UNIQUE NOT NULL,
    pool_name_sanitised VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    eggs_amount INTEGER DEFAULT 0 NOT NULL CHECK (eggs_amount >= 0),
    created_by_twitch_id VARCHAR(50) NOT NULL,
    created_by_username VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_pools_name_sanitised ON pools(pool_name_sanitised);
CREATE INDEX idx_pools_created_by ON pools(created_by_twitch_id);
CREATE INDEX idx_pools_active ON pools(is_active);

-- Create pool transactions table to track donations
CREATE TABLE IF NOT EXISTS pool_transactions (
    id SERIAL PRIMARY KEY,
    pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    donor_twitch_id VARCHAR(50) NOT NULL,
    donor_username VARCHAR(255) NOT NULL,
    eggs_amount INTEGER NOT NULL CHECK (eggs_amount > 0),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('donation', 'withdrawal', 'admin_add', 'admin_remove')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for transaction queries
CREATE INDEX idx_pool_transactions_pool_id ON pool_transactions(pool_id);
CREATE INDEX idx_pool_transactions_donor ON pool_transactions(donor_twitch_id);
CREATE INDEX idx_pool_transactions_date ON pool_transactions(created_at);

-- Trigger to update pools.updated_at on changes
CREATE OR REPLACE FUNCTION update_pools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pools_updated_at_trigger
BEFORE UPDATE ON pools
FOR EACH ROW
EXECUTE FUNCTION update_pools_updated_at();

-- Add constraint to prevent pool names that could conflict with usernames
ALTER TABLE pools ADD CONSTRAINT pool_name_reserved_prefix 
CHECK (pool_name_sanitised LIKE 'pool_%' OR pool_name_sanitised LIKE 'community_%');