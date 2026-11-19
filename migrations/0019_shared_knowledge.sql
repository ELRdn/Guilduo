-- Knowledge is independent of private productivity notes and Appwrite Quest state.
CREATE TABLE knowledge_settings (
  uid TEXT PRIMARY KEY, revision INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
  agent_ids_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
);
CREATE TABLE knowledge_projects (
  uid TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
  PRIMARY KEY(uid,id), UNIQUE(uid,name)
);
CREATE TABLE knowledge_quest_projects (
  uid TEXT NOT NULL, quest_id TEXT NOT NULL, project_id TEXT NOT NULL,
  PRIMARY KEY(uid,quest_id)
);
CREATE TABLE knowledge_items (
  uid TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
  title TEXT NOT NULL, content TEXT NOT NULL, kind TEXT NOT NULL,
  scope TEXT NOT NULL, project_id TEXT, quest_id TEXT,
  epistemic TEXT NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL,
  reason TEXT NOT NULL, content_hash TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY(uid,id)
);
CREATE UNIQUE INDEX knowledge_dedup ON knowledge_items(uid,content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX knowledge_context ON knowledge_items(uid,status,quest_id,project_id,updated_at);
CREATE TABLE knowledge_sources (
  uid TEXT NOT NULL, knowledge_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  reference TEXT NOT NULL, version TEXT NOT NULL, excerpt TEXT NOT NULL,
  availability TEXT NOT NULL,
  PRIMARY KEY(uid,knowledge_id,ordinal)
);
CREATE TABLE knowledge_revisions (
  uid TEXT NOT NULL, knowledge_id TEXT NOT NULL, revision INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(uid,knowledge_id,revision)
);
-- Content-free receipts survive deletion to prevent a delayed request recreating it.
CREATE TABLE knowledge_operations (
  uid TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  knowledge_id TEXT NOT NULL, result_revision INTEGER NOT NULL, token TEXT NOT NULL,
  PRIMARY KEY(uid,request_id)
);
CREATE TABLE knowledge_conflicts (
  uid TEXT NOT NULL, left_id TEXT NOT NULL, right_id TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0, winner_id TEXT, resolution_token TEXT, PRIMARY KEY(uid,left_id,right_id)
);
CREATE TABLE knowledge_index_jobs (
  uid TEXT NOT NULL, knowledge_id TEXT NOT NULL, revision INTEGER NOT NULL,
  action TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(uid,knowledge_id)
);
CREATE TABLE knowledge_index_entries (
  uid TEXT NOT NULL, knowledge_id TEXT NOT NULL, revision INTEGER NOT NULL, vector_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY(uid,knowledge_id,revision)
);
CREATE TABLE knowledge_index_config (id INTEGER PRIMARY KEY CHECK(id=1), model TEXT NOT NULL, dimensions INTEGER NOT NULL);
CREATE TABLE knowledge_embedding_budget (id TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0);
