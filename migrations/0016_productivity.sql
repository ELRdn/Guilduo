-- Private owner workspace, independent of public profiles and Appwrite Quests.
-- One revision CAS makes timer switching and operation receipts atomic.
CREATE TABLE IF NOT EXISTS productivity_workspaces (
  uid TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS productivity_rollout (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT NOT NULL
);
INSERT OR IGNORE INTO productivity_rollout(id,started_at)
  VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
