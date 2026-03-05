CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  share_token TEXT UNIQUE,
  edit_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lists_user
ON lists(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lists_share_token
ON lists(share_token);

CREATE TABLE IF NOT EXISTS saved_parcels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  sheet TEXT NOT NULL,
  plan_nbr TEXT NOT NULL,
  parcel_nbr TEXT NOT NULL,
  dist_code INTEGER,
  district TEXT,
  municipality TEXT,
  planning_zone TEXT,
  planning_zone_desc TEXT,
  block_code TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_parcels_unique
ON saved_parcels(list_id, sheet, plan_nbr, parcel_nbr, IFNULL(dist_code, -1));

CREATE INDEX IF NOT EXISTS idx_saved_parcels_list
ON saved_parcels(list_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_parcels_user
ON saved_parcels(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS list_shares (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_list_shares_unique
ON list_shares(list_id, email);

CREATE INDEX IF NOT EXISTS idx_list_shares_email
ON list_shares(email);

CREATE TABLE IF NOT EXISTS sale_listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_picture TEXT,
  sheet TEXT NOT NULL,
  plan_nbr TEXT NOT NULL,
  parcel_nbr TEXT NOT NULL,
  dist_code INTEGER,
  district TEXT,
  municipality TEXT,
  planning_zone TEXT,
  title TEXT,
  price INTEGER,
  description TEXT,
  contact TEXT NOT NULL,
  certificate_key TEXT,
  photo_keys TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sale_listings_status
ON sale_listings(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_listings_district
ON sale_listings(district, status);

CREATE INDEX IF NOT EXISTS idx_sale_listings_user
ON sale_listings(user_id);
