ALTER TABLE knowledge_items ADD COLUMN private_note_id TEXT;
ALTER TABLE knowledge_items ADD COLUMN private_note_version TEXT;
CREATE UNIQUE INDEX knowledge_private_note ON knowledge_items(uid,private_note_id) WHERE private_note_id IS NOT NULL;

CREATE TRIGGER knowledge_revoke_archived_notes
AFTER UPDATE OF value_json ON productivity_workspaces
WHEN EXISTS(SELECT 1 FROM knowledge_items WHERE uid=NEW.uid AND private_note_id IS NOT NULL AND status='active')
BEGIN
  UPDATE knowledge_items
  SET revision=revision+1,status='deleted',title='',content='',kind='',scope='',project_id=NULL,quest_id=NULL,
      epistemic='',reason='',private_note_version=NULL,updated_at=NEW.updated_at
  WHERE uid=NEW.uid AND private_note_id IS NOT NULL AND status='active'
    AND (json_extract(OLD.value_json,'$.noteShareReset') IS NOT json_extract(NEW.value_json,'$.noteShareReset')
      OR NOT EXISTS(SELECT 1 FROM json_each(NEW.value_json,'$.notes') n
        WHERE json_extract(n.value,'$.id')=private_note_id AND json_extract(n.value,'$.archived')=0));
END;
