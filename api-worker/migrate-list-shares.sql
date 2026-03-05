CREATE TABLE IF NOT EXISTS list_shares (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_list_shares_unique ON list_shares(list_id, email);
CREATE INDEX IF NOT EXISTS idx_list_shares_email ON list_shares(email);
