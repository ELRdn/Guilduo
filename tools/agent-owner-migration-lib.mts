import { createHash } from "node:crypto";

export type JsonRecord = Record<string, unknown>;
export type IdentityProof = {
  legacySource: "appwrite:legacy_states" | "firebase:auth-export";
  appwriteSource: "appwrite:users";
  firebaseUid: string;
  legacyEmailHash: string;
  appwriteUid: string;
  appwriteEmail: string;
  appwriteEmailVerified: boolean;
};

/**
 * Deliberately excludes `avatar_version` / `has_custom_avatar` /
 * `avatar_asset_id`. This tool copies Agent metadata rows to a new uid but
 * never touches R2 — the avatar image itself lives under an immutable,
 * randomly-generated R2 key (`agents/avatars/{crypto.randomUUID()}`,
 * agent-avatar-store.ts), never a uid-scoped one; D1's `avatar_asset_id` is
 * the only place that maps a uid+agentId to which object is current, and
 * that mapping is not migrated either. Including those columns in the
 * checksum would make a migrated Agent's copy legitimately mismatch its
 * source and fail `post_copy_checksum_mismatch`, since the new row always
 * starts at `avatar_version: 0` / `avatar_asset_id: null`. A migrated Agent
 * shows the role-crest/initials fallback until its owner re-uploads an
 * avatar under the new uid — the old R2 object is left in place, unreferenced,
 * for the same reason a superseded avatar is never deleted on a normal
 * replace (see PRIVACY.md).
 */
export type AgentRow = {
  uid: string; agent_id: string; display_name: string; provider: string; role: string;
  instructions: string; status: string; allowed_scopes: string; default_handoff_state: string;
  review_required: number; dry_run_default: number; created_at: string; updated_at: string;
};

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("base64url");
export const uidLabel = (uid: string): string => `${sha256(uid).slice(0, 10)}…`;

export function verifyIdentityProof(proof: IdentityProof): { oldUid: string; newUid: string; proofChecksum: string } {
  if (!["appwrite:legacy_states", "firebase:auth-export"].includes(proof.legacySource) || proof.appwriteSource !== "appwrite:users") {
    throw new Error("identity_source_invalid");
  }
  if (!proof.appwriteEmailVerified) throw new Error("appwrite_email_not_verified");
  const normalizedEmail = proof.appwriteEmail.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("appwrite_email_missing");
  const full = sha256(normalizedEmail);
  const compatible = proof.legacyEmailHash === full || proof.legacyEmailHash === full.slice(0, 36);
  if (!compatible) throw new Error("identity_email_hash_mismatch");
  if (!proof.firebaseUid || !proof.appwriteUid || proof.firebaseUid === proof.appwriteUid) throw new Error("identity_uid_invalid");
  return { oldUid: proof.firebaseUid, newUid: proof.appwriteUid, proofChecksum: sha256(JSON.stringify(proof)) };
}

const comparable = (row: AgentRow): JsonRecord => ({
  agentId: row.agent_id, displayName: row.display_name, provider: row.provider, role: row.role,
  instructions: row.instructions, scopes: JSON.parse(row.allowed_scopes || "[]"), status: row.status,
  defaultHandoffState: row.default_handoff_state, reviewRequired: Boolean(row.review_required),
  dryRunDefault: Boolean(row.dry_run_default), updatedAt: row.updated_at,
});

export const agentChecksum = (row: AgentRow): string => sha256(JSON.stringify(comparable(row)));

export function planAgentOwnerMigration(proof: IdentityProof, rows: AgentRow[], connectionCount = 0) {
  const identity = verifyIdentityProof(proof);
  const source = rows.filter((row) => row.uid === identity.oldUid);
  const destination = new Map(rows.filter((row) => row.uid === identity.newUid).map((row) => [row.agent_id, row]));
  const items = source.map((row) => {
    const existing = destination.get(row.agent_id);
    if (!existing) return { status: "copy" as const, agentId: row.agent_id, checksum: agentChecksum(row), row };
    if (agentChecksum(existing) === agentChecksum(row)) return { status: "already_migrated" as const, agentId: row.agent_id, checksum: agentChecksum(row) };
    return { status: "conflict" as const, agentId: row.agent_id, sourceChecksum: agentChecksum(row), destinationChecksum: agentChecksum(existing) };
  });
  return {
    identity: { oldUid: uidLabel(identity.oldUid), newUid: uidLabel(identity.newUid), proofChecksum: identity.proofChecksum },
    counts: {
      source: source.length,
      copy: items.filter((item) => item.status === "copy").length,
      alreadyMigrated: items.filter((item) => item.status === "already_migrated").length,
      conflicts: items.filter((item) => item.status === "conflict").length,
      connectionsSkipped: connectionCount,
    },
    items,
    checksum: sha256(JSON.stringify(items.map((item) => ({ status: item.status, agentId: item.agentId, checksum: "checksum" in item ? item.checksum : item.sourceChecksum })))),
  };
}
