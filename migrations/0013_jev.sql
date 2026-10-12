-- No prompts, Quest text, Agent instructions, profile data or API keys are retained.
CREATE TABLE IF NOT EXISTS jev_decisions (
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  uid TEXT NOT NULL,
  id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  quest_version TEXT NOT NULL,
  agent_ids TEXT NOT NULL CHECK (json_valid(agent_ids)),
  model TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  status TEXT NOT NULL CHECK (status IN ('created','reserved','sending','settling','suggestion','manual','pending','error')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  provider_request_id TEXT,
  http_status INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_nano_usd INTEGER,
  max_cost_nano_usd INTEGER NOT NULL CHECK (max_cost_nano_usd > 0),
  budget_reserved INTEGER NOT NULL DEFAULT 0 CHECK (budget_reserved IN (0,1)),
  error_code TEXT,
  credit_outcome TEXT CHECK (credit_outcome IS NULL OR credit_outcome IN ('commit','return')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mode, uid, id)
);
CREATE INDEX IF NOT EXISTS jev_decisions_reconcile ON jev_decisions(status, updated_at);

-- Persistent global ceiling includes calls of unknown outcome at full worst-case cost.
CREATE TABLE IF NOT EXISTS jev_budget (
  id TEXT PRIMARY KEY CHECK (id = 'official'),
  used_nano_usd INTEGER NOT NULL DEFAULT 0 CHECK (used_nano_usd >= 0)
);
INSERT OR IGNORE INTO jev_budget(id) VALUES ('official');
