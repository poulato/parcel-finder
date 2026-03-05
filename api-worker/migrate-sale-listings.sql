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
