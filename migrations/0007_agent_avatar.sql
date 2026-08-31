ALTER TABLE agent_registry_agents ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_registry_agents ADD COLUMN has_custom_avatar INTEGER NOT NULL DEFAULT 0;
-- R2 object key suffix for the currently-active avatar image (agents/avatars/{avatar_asset_id}).
-- NULL means no custom avatar. Never exposed in any API response — D1 is the
-- only place that maps an Agent to "which R2 object is currently live".
ALTER TABLE agent_registry_agents ADD COLUMN avatar_asset_id TEXT NULL;
