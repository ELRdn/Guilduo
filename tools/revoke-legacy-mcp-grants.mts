import { readFile, stat } from "node:fs/promises";
import { uidLabel, verifyIdentityProof, type IdentityProof } from "./agent-owner-migration-lib.mts";

type Grant = { uid: string; clientId: string; clientName?: string; accessHash?: string; refreshHash?: string; revokedAt?: string };
const args = process.argv.slice(2); const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? "" : String(args[i + 1] || ""); };
const inventoryPath = value("--inventory"); const proofPath = value("--identity-proof"); const backupPath = value("--backup"); const execute = args.includes("--execute");
if (!inventoryPath || !proofPath) throw new Error("Usage: revoke:legacy-mcp -- --identity-proof <json> --inventory <json> [--backup <kv-export.json> --execute]");
const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as { oldUid: string; grants: Grant[] };
const identity = verifyIdentityProof(JSON.parse(await readFile(proofPath, "utf8")) as IdentityProof);
if (inventory.oldUid !== identity.oldUid) throw new Error("inventory_identity_mismatch");
const grants = (inventory.grants || []).filter((grant) => grant.uid === inventory.oldUid);
console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", owner: uidLabel(inventory.oldUid), clients: grants.map((grant) => grant.clientName || "Unnamed MCP client"), grants: grants.length, accessTokens: grants.filter((g) => g.accessHash).length, refreshTokens: grants.filter((g) => g.refreshHash).length }, null, 2));
if (!execute) process.exit(0);
if (!backupPath || (await stat(backupPath)).size === 0) throw new Error("non_empty_kv_backup_required");
const account = String(process.env.CLOUDFLARE_ACCOUNT_ID || ""), namespace = String(process.env.CLOUDFLARE_KV_NAMESPACE_ID || ""), token = String(process.env.CLOUDFLARE_API_TOKEN || "");
if (!account || !namespace || !token) throw new Error("Cloudflare execute credentials are missing");
const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/storage/kv/namespaces/${encodeURIComponent(namespace)}/values/`;
const request = async (key: string, init: RequestInit) => { const response = await fetch(base + encodeURIComponent(key), { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } }); if (!response.ok) throw new Error(`kv_request_failed:${response.status}`); };
for (const grant of grants) {
  if (grant.accessHash) await request(`access:${grant.accessHash}`, { method: "DELETE" });
  if (grant.refreshHash) await request(`refresh:${grant.refreshHash}`, { method: "DELETE" });
  const revoked = { ...grant, revokedAt: grant.revokedAt || new Date().toISOString(), accessHash: "", refreshHash: "" };
  await request(`user-client:${inventory.oldUid}:${grant.clientId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(revoked) });
}
console.log(JSON.stringify({ status: "complete", revokedClients: grants.length, clientRegistrationsRetained: true, tokensCopied: 0 }));
