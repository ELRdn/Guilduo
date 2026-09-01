CREATE TABLE IF NOT EXISTS oauth_records (
  record_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_records_expires_at
  ON oauth_records (expires_at)
  WHERE expires_at > 0;
