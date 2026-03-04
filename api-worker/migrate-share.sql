ALTER TABLE lists ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE lists ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_share_token ON lists(share_token);
