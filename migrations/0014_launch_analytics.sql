-- Optional, separately consented pseudonymous analytics. No prompts or URL text.
CREATE TABLE launch_analytics_preferences (
  uid TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('granted','denied')),
  policy_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE launch_analytics_subjects (
  uid TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE,
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  account_created_at TEXT,
  cohort TEXT NOT NULL CHECK(cohort IN ('new','existing','unknown')),
  environment TEXT NOT NULL CHECK(environment IN ('test','live')),
  first_campaign TEXT NOT NULL DEFAULT 'unknown',
  last_campaign TEXT NOT NULL DEFAULT 'unknown',
  acquisition_frozen INTEGER NOT NULL DEFAULT 0 CHECK(acquisition_frozen IN (0,1)),
  excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN (0,1))
);
CREATE TABLE launch_analytics_visits (
  token_hash TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL UNIQUE,
  campaign TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('test','live')),
  consent_version TEXT NOT NULL,
  claimed_subject TEXT,
  clicked_at TEXT
);
CREATE TABLE launch_analytics_events (
  subject_id TEXT NOT NULL REFERENCES launch_analytics_subjects(subject_id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  name TEXT NOT NULL,
  at TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  agent_reference TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(subject_id,event_key)
);
CREATE INDEX launch_analytics_events_time ON launch_analytics_events(at,name);
CREATE TABLE launch_analytics_payments (
  subject_id TEXT NOT NULL REFERENCES launch_analytics_subjects(subject_id) ON DELETE CASCADE,
  invoice_key TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  currency TEXT NOT NULL,
  paid_minor INTEGER NOT NULL CHECK(paid_minor > 0),
  refunded_minor INTEGER NOT NULL DEFAULT 0 CHECK(refunded_minor >= 0),
  refund_exact INTEGER NOT NULL DEFAULT 1 CHECK(refund_exact IN (0,1)),
  disputed INTEGER NOT NULL DEFAULT 0 CHECK(disputed IN (0,1)),
  is_initial INTEGER NOT NULL DEFAULT 0 CHECK(is_initial IN (0,1)),
  interval TEXT NOT NULL CHECK(interval IN ('monthly','annual')),
  reconciled_at TEXT NOT NULL,
  PRIMARY KEY(subject_id,invoice_key)
);
CREATE TABLE launch_analytics_rate (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK(count > 0),
  expires_at TEXT NOT NULL
);
CREATE TABLE launch_analytics_health (
  id TEXT PRIMARY KEY CHECK(id='collector'),
  last_success_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  outbox_overflow INTEGER NOT NULL DEFAULT 0
);
INSERT INTO launch_analytics_health(id) VALUES ('collector');
-- Survives D1 subject removal until the private snapshot has been scrubbed.
CREATE TABLE launch_analytics_cleanup (
  uid TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  PRIMARY KEY(uid,subject_id)
);
