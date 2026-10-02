-- Existing single-Agent connections retain their agent_id and permissions.
ALTER TABLE agent_registry_connections ADD COLUMN allowed_agent_ids TEXT NOT NULL DEFAULT '[]';
