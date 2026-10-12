-- Additive, mode-isolated metadata. Money remains authoritative in Stripe.
CREATE TABLE billing_accounts (
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  uid TEXT NOT NULL,
  customer_id TEXT,
  referral_code TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  mutation_token TEXT NOT NULL DEFAULT '',
  balance INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro')),
  period_end TEXT,
  selected_agent_ids TEXT NOT NULL DEFAULT '[]',
  maintenance_order INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  PRIMARY KEY(mode, uid),
  UNIQUE(mode, customer_id),
  UNIQUE(mode, referral_code)
);
CREATE INDEX billing_accounts_maintenance ON billing_accounts(mode, maintenance_order, uid);
CREATE TABLE billing_credit_lots (
  mode TEXT NOT NULL,
  uid TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(mode, uid, source)
);
CREATE TABLE billing_credit_reservations (
  mode TEXT NOT NULL,
  uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(mode, uid, request_id)
);
CREATE TABLE billing_credit_ledger (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('grant','reserve','commit','return','expire','reverse')),
  source TEXT NOT NULL,
  request_id TEXT,
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX billing_credit_ledger_owner ON billing_credit_ledger(mode, uid, created_at DESC, id DESC);
CREATE TABLE billing_stripe_events (
  mode TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY(mode, event_id)
);
-- Each referred customer has one immutable attribution and one qualifying invoice.
CREATE TABLE billing_referrals (
  mode TEXT NOT NULL,
  referred_uid TEXT NOT NULL,
  referrer_uid TEXT NOT NULL,
  invoice_id TEXT,
  reward_amount INTEGER,
  reward_expires_at TEXT,
  reversed INTEGER NOT NULL DEFAULT 0 CHECK(reversed IN (0,1)),
  PRIMARY KEY(mode, referred_uid),
  UNIQUE(mode, invoice_id),
  CHECK(referred_uid <> referrer_uid)
);
