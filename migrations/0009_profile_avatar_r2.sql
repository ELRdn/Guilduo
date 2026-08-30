-- Private profile Avatar metadata. The image bytes live in the existing R2
-- binding under profiles/avatars/{avatar_asset_id}; D1 remains the source of
-- truth for the current asset and its cache-busting version.
ALTER TABLE social_profiles ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE social_profiles ADD COLUMN avatar_asset_id TEXT NULL;
