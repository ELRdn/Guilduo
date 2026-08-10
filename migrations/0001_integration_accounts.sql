CREATE TABLE IF NOT EXISTS integration_accounts (
  uid TEXT NOT NULL,
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  provider_account_id TEXT,
  provider_account_name TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  cursor_json TEXT NOT NULL DEFAULT '{}',
  last_synced_at TEXT,
  last_error TEXT,
  lock_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, service)
);

CREATE INDEX IF NOT EXISTS integration_accounts_due
  ON integration_accounts (status, updated_at);

CREATE TABLE IF NOT EXISTS integration_calendar_events (
  uid TEXT NOT NULL,
  service TEXT NOT NULL,
  external_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  calendar_name TEXT NOT NULL DEFAULT '',
  html_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed',
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, service, external_id)
);

CREATE INDEX IF NOT EXISTS integration_calendar_events_day
  ON integration_calendar_events (uid, start_at, end_at);

CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  service TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS integration_sync_logs_user
  ON integration_sync_logs (uid, created_at DESC);
