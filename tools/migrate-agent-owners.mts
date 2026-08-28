import { readFile, stat } from "node:fs/promises";
import { agentChecksum, planAgentOwnerMigration, verifyIdentityProof, type AgentRow, type IdentityProof } from "./agent-owner-migration-lib.mts";

const args = process.argv.slice(2);
const has = (name: string) => args.includes(name);
const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? "" : String(args[index + 1] || ""); };
const proofPath = value("--identity-proof");
const snapshotPath = value("--d1-snapshot");
const backupPath = value("--backup");
const firebaseAuthExportPath = value("--firebase-auth-export");
const execute = has("--execute");
if (!proofPath || !snapshotPath) throw new Error("Usage: migrate:agent-owners -- --identity-proof <json> --d1-snapshot <json> [--firebase-auth-export <auth.json>] [--backup <d1-export.sql> --execute]");

const proof = JSON.parse(await readFile(proofPath, "utf8")) as IdentityProof;
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as { agents: AgentRow[]; connections?: unknown[] };
const identity = verifyIdentityProof(proof);
const plan = planAgentOwnerMigration(proof, snapshot.agents || [], snapshot.connections?.filter((item) => (item as { uid?: string }).uid === identity.oldUid).length || 0);
console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", ...plan, items: plan.items.map(({ row: _row, ...item }) => item) }, null, 2));
if (!execute) process.exit(0);
if (plan.counts.conflicts > 0) throw new Error("migration_conflicts_present");
if (!backupPath || (await stat(backupPath)).size === 0) throw new Error("non_empty_d1_backup_required");
const appwriteEndpoint = String(process.env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
const appwriteProject = String(process.env.APPWRITE_PROJECT_ID || "");
const appwriteDatabase = String(process.env.APPWRITE_DATABASE_ID || "");
const appwriteLegacyTable = String(process.env.APPWRITE_LEGACY_TABLE_ID || "");
const appwriteKey = String(process.env.APPWRITE_API_KEY || "");
if (!appwriteEndpoint || !appwriteProject || !appwriteDatabase || !appwriteLegacyTable || !appwriteKey) throw new Error("Appwrite live identity verification credentials are missing");
const appwriteHeaders = { "x-appwrite-project": appwriteProject, "x-appwrite-key": appwriteKey };
const userResponse = await fetch(`${appwriteEndpoint}/users/${encodeURIComponent(identity.newUid)}`, { headers: appwriteHeaders });
if (!userResponse.ok) throw new Error(`appwrite_user_read_failed:${userResponse.status}`);
const liveUser = await userResponse.json() as { email?: string; emailVerification?: boolean };
if (liveUser.emailVerification !== true || String(liveUser.email || "").trim().toLowerCase() !== proof.appwriteEmail.trim().toLowerCase()) throw new Error("appwrite_live_identity_mismatch");
if (proof.legacySource === "appwrite:legacy_states") {
  const legacyRowId = proof.legacyEmailHash.slice(0, 36);
  const legacyResponse = await fetch(`${appwriteEndpoint}/tablesdb/${encodeURIComponent(appwriteDatabase)}/tables/${encodeURIComponent(appwriteLegacyTable)}/rows/${encodeURIComponent(legacyRowId)}`, { headers: appwriteHeaders });
  if (!legacyResponse.ok) throw new Error(`legacy_state_read_failed:${legacyResponse.status}`);
  const liveLegacy = await legacyResponse.json() as { firebaseUid?: string; emailHash?: string };
  if (liveLegacy.firebaseUid !== identity.oldUid || ![proof.legacyEmailHash, legacyRowId].includes(String(liveLegacy.emailHash || ""))) throw new Error("legacy_live_identity_mismatch");
} else {
  if (!firebaseAuthExportPath || (await stat(firebaseAuthExportPath)).size === 0) throw new Error("non_empty_firebase_auth_export_required");
  const rawExport = JSON.parse(await readFile(firebaseAuthExportPath, "utf8")) as unknown;
  const exportRecord = rawExport && typeof rawExport === "object" && !Array.isArray(rawExport) ? rawExport as { users?: unknown[] } : {};
  const authUsers = Array.isArray(rawExport) ? rawExport : Array.isArray(exportRecord.users) ? exportRecord.users : [];
  const matching = authUsers.filter((raw) => {
    const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const uid = String(record.localId || record.uid || record.user_id || "");
    const email = String(record.email || "").trim().toLowerCase();
    return uid === identity.oldUid && email === proof.appwriteEmail.trim().toLowerCase();
  });
  if (matching.length !== 1) throw new Error("firebase_auth_export_identity_mismatch");
}
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "");
const databaseId = String(process.env.CLOUDFLARE_D1_DATABASE_ID || "");
const token = String(process.env.CLOUDFLARE_API_TOKEN || "");
if (!accountId || !databaseId || !token) throw new Error("Cloudflare execute credentials are missing");
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
const query = async (sql: string, params: unknown[]) => {
  const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sql, params }) });
  if (!response.ok) throw new Error(`d1_query_failed:${response.status}`);
  return response.json() as Promise<{ result?: Array<{ results?: AgentRow[] }> }>;
};
const sql = `INSERT OR IGNORE INTO agent_registry_agents (uid,agent_id,display_name,provider,role,instructions,status,allowed_scopes,default_handoff_state,review_required,dry_run_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
for (const item of plan.items) if (item.status === "copy") {
  const row = item.row;
  await query(sql, [identity.newUid,row.agent_id,row.display_name,row.provider,row.role,row.instructions,row.status,row.allowed_scopes,row.default_handoff_state,row.review_required,row.dry_run_default,row.created_at,row.updated_at]);
}
const reread = await query("SELECT * FROM agent_registry_agents WHERE uid = ? ORDER BY agent_id", [identity.newUid]);
const migrated = reread.result?.[0]?.results || [];
for (const item of plan.items) if (item.status === "copy") {
  const copied = migrated.find((row) => row.agent_id === item.agentId);
  if (!copied || agentChecksum(copied) !== item.checksum) throw new Error(`post_copy_checksum_mismatch:${item.agentId}`);
}
console.log(JSON.stringify({ status: "complete", copied: plan.counts.copy, sourceRetained: true, connectionsCopied: 0, checksum: plan.checksum }));
