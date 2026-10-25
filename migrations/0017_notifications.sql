-- Web Push: the gateway's own VAPID key, each person's devices and settings,
-- and one queue of pending notifications that the per-minute cron sends.
CREATE TABLE IF NOT EXISTS notification_keys (
  id TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_settings (
  uid TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_uid ON push_subscriptions(uid);
CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS notification_jobs_due ON notification_jobs(sent_at, fire_at);
CREATE INDEX IF NOT EXISTS notification_jobs_uid ON notification_jobs(uid, kind, sent_at);
