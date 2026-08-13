CREATE TABLE IF NOT EXISTS toggl_focus_attributions (
  uid TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  focus_task_id TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'direct',
  status TEXT NOT NULL DEFAULT 'confirmed',
  entry_updated_at TEXT NOT NULL DEFAULT '',
  entry_start_at TEXT NOT NULL DEFAULT '',
  entry_stop_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, entry_id)
);

CREATE INDEX IF NOT EXISTS toggl_focus_attributions_quest
  ON toggl_focus_attributions (uid, quest_id, entry_start_at DESC);

CREATE TABLE IF NOT EXISTS toggl_focus_task_links (
  uid TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  focus_task_id TEXT NOT NULL,
  organization_id TEXT NOT NULL DEFAULT '',
  workspace_id TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, quest_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS toggl_focus_task_links_remote
  ON toggl_focus_task_links (uid, focus_task_id);
