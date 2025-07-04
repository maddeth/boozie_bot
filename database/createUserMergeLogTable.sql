-- Create user merge log table to track account merge operations
CREATE TABLE IF NOT EXISTS user_merge_log (
    id SERIAL PRIMARY KEY,
    source_user_id VARCHAR(255) NOT NULL,
    source_username VARCHAR(255) NOT NULL,
    target_user_id VARCHAR(255) NOT NULL,
    target_username VARCHAR(255) NOT NULL,
    eggs_transferred INTEGER NOT NULL,
    admin_twitch_id VARCHAR(50) NOT NULL,
    admin_username VARCHAR(255) NOT NULL,
    reason TEXT,
    merge_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_merge_log_source ON user_merge_log(source_user_id);
CREATE INDEX IF NOT EXISTS idx_user_merge_log_target ON user_merge_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_merge_log_admin ON user_merge_log(admin_twitch_id);
CREATE INDEX IF NOT EXISTS idx_user_merge_log_date ON user_merge_log(merge_date);