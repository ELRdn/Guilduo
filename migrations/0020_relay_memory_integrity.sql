-- Knowledge consent is tied to a specific membership generation.
ALTER TABLE agent_registry_connections ADD COLUMN knowledge_epoch TEXT NOT NULL DEFAULT '';
CREATE TRIGGER knowledge_connection_epoch
AFTER UPDATE OF agent_id, allowed_agent_ids, revoked_at ON agent_registry_connections
WHEN OLD.agent_id IS NOT NEW.agent_id OR OLD.allowed_agent_ids IS NOT NEW.allowed_agent_ids OR OLD.revoked_at IS NOT NEW.revoked_at
BEGIN
  UPDATE agent_registry_connections SET knowledge_epoch = lower(hex(randomblob(16)))
  WHERE uid = NEW.uid AND client_id = NEW.client_id;
END;
CREATE TRIGGER knowledge_connection_initial_epoch
AFTER INSERT ON agent_registry_connections
BEGIN
  UPDATE agent_registry_connections SET knowledge_epoch = lower(hex(randomblob(16)))
  WHERE uid = NEW.uid AND client_id = NEW.client_id;
END;
UPDATE agent_registry_connections SET knowledge_epoch = lower(hex(randomblob(16))) WHERE knowledge_epoch = '';
ALTER TABLE knowledge_settings ADD COLUMN grants_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE knowledge_items ADD COLUMN source_actor TEXT;
ALTER TABLE knowledge_items ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0;
CREATE TABLE knowledge_search_versions (uid TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TRIGGER knowledge_items_insert_search_version AFTER INSERT ON knowledge_items
BEGIN
  INSERT INTO knowledge_search_versions VALUES(NEW.uid,1)
  ON CONFLICT(uid) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER knowledge_items_update_search_version AFTER UPDATE ON knowledge_items
BEGIN
  INSERT INTO knowledge_search_versions VALUES(NEW.uid,1)
  ON CONFLICT(uid) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER knowledge_items_delete_search_version AFTER DELETE ON knowledge_items
BEGIN
  INSERT INTO knowledge_search_versions VALUES(OLD.uid,1)
  ON CONFLICT(uid) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER knowledge_quest_projects_insert_search_version AFTER INSERT ON knowledge_quest_projects
BEGIN
  INSERT INTO knowledge_search_versions VALUES(NEW.uid,1)
  ON CONFLICT(uid) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER knowledge_quest_projects_update_search_version AFTER UPDATE ON knowledge_quest_projects
BEGIN
  INSERT INTO knowledge_search_versions VALUES(NEW.uid,1)
  ON CONFLICT(uid) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER knowledge_quest_projects_delete_search_version AFTER DELETE ON knowledge_quest_projects
BEGIN
  INSERT INTO knowledge_search_versions VALUES(OLD.uid,1)
  ON CONFLICT(uid) DO UPDATE SET revision=revision+1;
END;
CREATE TABLE knowledge_index_leases (
  uid TEXT NOT NULL, knowledge_id TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY(uid,knowledge_id)
);
ALTER TABLE knowledge_index_entries ADD COLUMN checked_at INTEGER NOT NULL DEFAULT 0;
