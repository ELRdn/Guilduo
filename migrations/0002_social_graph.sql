CREATE TABLE IF NOT EXISTS social_profiles (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  avatar_role TEXT NOT NULL DEFAULT 'sentinel',
  avatar_variant TEXT NOT NULL DEFAULT 'femme',
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  handle_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS social_profiles_handle
  ON social_profiles (handle COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  sender_uid TEXT NOT NULL,
  receiver_uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (sender_uid <> receiver_uid),
  FOREIGN KEY (sender_uid) REFERENCES social_profiles(uid),
  FOREIGN KEY (receiver_uid) REFERENCES social_profiles(uid)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_direction
  ON friend_requests (sender_uid, receiver_uid)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS friend_requests_receiver
  ON friend_requests (receiver_uid, status, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  user_low TEXT NOT NULL,
  user_high TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high),
  FOREIGN KEY (user_low) REFERENCES social_profiles(uid),
  FOREIGN KEY (user_high) REFERENCES social_profiles(uid)
);

CREATE INDEX IF NOT EXISTS friendships_high
  ON friendships (user_high, created_at DESC);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 4 CHECK (max_members BETWEEN 1 AND 4),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_uid) REFERENCES social_profiles(uid)
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id TEXT NOT NULL,
  uid TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (party_id, uid),
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (uid) REFERENCES social_profiles(uid)
);

CREATE INDEX IF NOT EXISTS party_members_party
  ON party_members (party_id, joined_at);

CREATE TRIGGER IF NOT EXISTS party_members_capacity
BEFORE INSERT ON party_members
WHEN (
  SELECT COUNT(*) FROM party_members WHERE party_id = NEW.party_id
) >= (
  SELECT max_members FROM parties WHERE id = NEW.party_id
)
BEGIN
  SELECT RAISE(ABORT, 'party_full');
END;

CREATE TABLE IF NOT EXISTS party_invites (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  inviter_uid TEXT NOT NULL,
  invitee_uid TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (inviter_uid) REFERENCES social_profiles(uid),
  FOREIGN KEY (invitee_uid) REFERENCES social_profiles(uid)
);

CREATE INDEX IF NOT EXISTS party_invites_party
  ON party_invites (party_id, status, expires_at);

CREATE INDEX IF NOT EXISTS party_invites_invitee
  ON party_invites (invitee_uid, status, expires_at);
