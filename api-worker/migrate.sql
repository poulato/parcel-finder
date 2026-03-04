CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lists_user
ON lists(user_id, created_at DESC);

-- Add list_id column to saved_parcels (nullable for migration, existing rows get cleaned up)
ALTER TABLE saved_parcels ADD COLUMN list_id TEXT REFERENCES lists(id) ON DELETE CASCADE;

-- Drop old unique index and create new one scoped to list
DROP INDEX IF EXISTS idx_saved_parcels_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_parcels_unique
ON saved_parcels(list_id, sheet, plan_nbr, parcel_nbr, IFNULL(dist_code, -1));

CREATE INDEX IF NOT EXISTS idx_saved_parcels_list
ON saved_parcels(list_id, created_at DESC);
