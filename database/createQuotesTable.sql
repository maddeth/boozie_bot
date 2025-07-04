-- Quotes Schema for BoozieBot PostgreSQL Database
-- This creates the quotes table for storing stream quotes

CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  quote_text TEXT NOT NULL,
  quoted_by VARCHAR(255) NOT NULL,  -- Who said the quote (usually the streamer)
  added_by VARCHAR(255) NOT NULL,   -- Username who added the quote
  added_by_id VARCHAR(50),          -- Twitch user ID of who added it
  date_said TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- When the quote was said
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted BOOLEAN DEFAULT false     -- Soft delete for quote recovery
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_quoted_by ON quotes(quoted_by);
CREATE INDEX IF NOT EXISTS idx_quotes_added_by ON quotes(added_by);
CREATE INDEX IF NOT EXISTS idx_quotes_deleted ON quotes(deleted);
CREATE INDEX IF NOT EXISTS idx_quotes_date_said ON quotes(date_said);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at on row updates
DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW
    EXECUTE PROCEDURE update_quotes_updated_at();

-- Comments for documentation
COMMENT ON TABLE quotes IS 'Storage for memorable quotes from streams';
COMMENT ON COLUMN quotes.quote_text IS 'The actual quote text';
COMMENT ON COLUMN quotes.quoted_by IS 'Person who said the quote (usually streamer)';
COMMENT ON COLUMN quotes.added_by IS 'Username of person who added the quote';
COMMENT ON COLUMN quotes.deleted IS 'Soft delete flag to allow quote recovery';