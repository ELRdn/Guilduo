CREATE TABLE IF NOT EXISTS quest_images (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','uploading','ready','deleted')),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  reserved_bytes INTEGER NOT NULL,
  identity_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS quest_images_owner ON quest_images(uid, quest_id, status);
CREATE INDEX IF NOT EXISTS quest_images_cleanup ON quest_images(status, expires_at);
