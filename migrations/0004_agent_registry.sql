CREATE TABLE IF NOT EXISTS agent_registry_agents (
  uid TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'generic',
  role TEXT NOT NULL DEFAULT 'assistant',
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'archived')),
  allowed_scopes TEXT NOT NULL DEFAULT '[]',
  default_handoff_state TEXT NOT NULL DEFAULT '',
  review_required INTEGER NOT NULL DEFAULT 0,
  dry_run_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, agent_id)
);

CREATE INDEX IF NOT EXISTS agent_registry_agents_owner
  ON agent_registry_agents (uid, status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_registry_connections (
  client_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  first_connected_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, client_id),
  FOREIGN KEY (uid, agent_id) REFERENCES agent_registry_agents(uid, agent_id)
);

CREATE INDEX IF NOT EXISTS agent_registry_connections_agent
  ON agent_registry_connections (uid, agent_id, first_connected_at DESC);

CREATE INDEX IF NOT EXISTS agent_registry_connections_owner
  ON agent_registry_connections (uid, revoked_at);
