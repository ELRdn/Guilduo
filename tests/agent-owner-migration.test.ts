import assert from "node:assert/strict";
import test from "node:test";
import { planAgentOwnerMigration, sha256, verifyIdentityProof, type AgentRow, type IdentityProof } from "../tools/agent-owner-migration-lib.mts";

const proof = (overrides: Partial<IdentityProof> = {}): IdentityProof => ({ legacySource: "appwrite:legacy_states", appwriteSource: "appwrite:users", firebaseUid: "firebase-old", legacyEmailHash: sha256("owner@example.com").slice(0, 36), appwriteUid: "appwrite-new", appwriteEmail: "Owner@Example.com", appwriteEmailVerified: true, ...overrides });
const row = (uid: string, name = "Agent"): AgentRow => ({ uid, agent_id: "runner", display_name: name, provider: "generic", role: "assistant", instructions: "Safe", status: "active", allowed_scopes: '["quests:read"]', default_handoff_state: "ready", review_required: 1, dry_run_default: 1, created_at: "2026-01-01", updated_at: "2026-01-01" });

test("identity proof rejects unverified or mismatched users", () => {
  assert.throws(() => verifyIdentityProof(proof({ appwriteEmailVerified: false })), /not_verified/);
  assert.throws(() => verifyIdentityProof(proof({ legacyEmailHash: "wrong" })), /hash_mismatch/);
});

test("identity proof accepts a Firebase Auth export fallback for consumed legacy rows", () => {
  const verified = verifyIdentityProof(proof({ legacySource: "firebase:auth-export" }));
  assert.equal(verified.oldUid, "firebase-old");
  assert.equal(verified.newUid, "appwrite-new");
});
test("plans Agent-only idempotent migration and skips connections", () => {
  const first = planAgentOwnerMigration(proof(), [row("firebase-old")], 2);
  assert.deepEqual(first.counts, { source: 1, copy: 1, alreadyMigrated: 0, conflicts: 0, connectionsSkipped: 2 });
  const repeat = planAgentOwnerMigration(proof(), [row("firebase-old"), row("appwrite-new")], 2);
  assert.equal(repeat.items[0].status, "already_migrated");
});
test("does not overwrite a conflicting destination Agent", () => {
  const plan = planAgentOwnerMigration(proof(), [row("firebase-old", "Old"), row("appwrite-new", "New")]);
  assert.equal(plan.counts.conflicts, 1);
});
