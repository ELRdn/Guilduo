import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";

type RecordValue = Record<string, unknown>;
type MigrationItem = { firebaseUid: string; email: string; rowId: string; stateJson: string; schemaVersion: number; clientUpdatedAt: string; checksum: string };

const args = new Set(process.argv.slice(2));
const valueAfter = (name: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
};
const execute = args.has("--execute");
const summaryOnly = args.has("--summary-only");
const statePath = valueAfter("--state-export");
const usersPath = valueAfter("--users-export");
if (!statePath || !usersPath) throw new Error("Usage: migrate:appwrite -- --state-export <rtdb.json> --users-export <auth.json> [--execute]");

const asRecord = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const digest = (value: string): string => createHash("sha256").update(value).digest("base64url");
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8")) as unknown;

const stateExport = asRecord(await readJson(statePath));
const authExport = await readJson(usersPath);
const authUsers = Array.isArray(authExport) ? authExport : Array.isArray(asRecord(authExport).users) ? asRecord(authExport).users as unknown[] : [];
const emailByUid = new Map<string, string>();
for (const raw of authUsers) {
  const item = asRecord(raw);
  const uid = String(item.localId || item.uid || item.user_id || "");
  const email = String(item.email || "").trim().toLowerCase();
  if (uid && email) emailByUid.set(uid, email);
}

const rootUsers = asRecord(asRecord(stateExport).users || stateExport);
const items: MigrationItem[] = [];
const skipped: string[] = [];
for (const [firebaseUid, rawUser] of Object.entries(rootUsers)) {
  const email = emailByUid.get(firebaseUid) || "";
  const current = asRecord(asRecord(asRecord(rawUser).state).current);
  const state = asRecord(current.state);
  if (!email || !Array.isArray(state.tasks)) { skipped.push(firebaseUid); continue; }
  const rawStateJson = JSON.stringify(state);
  const stateJson = `gzip:${gzipSync(rawStateJson).toString("base64")}`;
  // legacy_states.stateJson uses longtext, matching the Worker's user_states storage contract.
  items.push({
    firebaseUid,
    email,
    rowId: digest(email).slice(0, 36),
    stateJson,
    schemaVersion: Number(current.schemaVersion || state.schemaVersion || 3),
    clientUpdatedAt: String(current.clientUpdatedAt || state.updatedAt || ""),
    checksum: digest(rawStateJson),
  });
}

console.log(JSON.stringify({
  mode: execute ? "execute" : "dry-run",
  usersInDatabase: Object.keys(rootUsers).length,
  usersWithAuthEmail: emailByUid.size,
  ready: items.length,
  skipped: skipped.length,
  ...(summaryOnly ? {} : { checksums: items.map(({ firebaseUid, checksum }) => ({ firebaseUid, checksum })) }),
}, null, 2));
if (!execute) process.exit(0);

const required = ["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_DATABASE_ID", "APPWRITE_LEGACY_TABLE_ID", "APPWRITE_API_KEY"] as const;
for (const name of required) if (!String(process.env[name] || "").trim()) throw new Error(`Missing environment variable: ${name}`);
const endpoint = String(process.env.APPWRITE_ENDPOINT).replace(/\/$/, "");
const tableUrl = `${endpoint}/tablesdb/${encodeURIComponent(String(process.env.APPWRITE_DATABASE_ID))}/tables/${encodeURIComponent(String(process.env.APPWRITE_LEGACY_TABLE_ID))}/rows`;
const headers = { "content-type": "application/json", "x-appwrite-project": String(process.env.APPWRITE_PROJECT_ID), "x-appwrite-key": String(process.env.APPWRITE_API_KEY) };

for (const item of items) {
  const data = { ownerId: "", firebaseUid: item.firebaseUid, emailHash: item.rowId, schemaVersion: item.schemaVersion, revision: 0, clientUpdatedAt: item.clientUpdatedAt, deviceId: "firebase-migration", stateJson: item.stateJson, checksum: item.checksum };
  const create = await fetch(tableUrl, { method: "POST", headers, body: JSON.stringify({ rowId: item.rowId, data }) });
  if (create.status === 409) {
    const update = await fetch(`${tableUrl}/${encodeURIComponent(item.rowId)}`, { method: "PATCH", headers, body: JSON.stringify({ data }) });
    if (!update.ok) throw new Error(`Legacy state update failed for ${item.firebaseUid}: ${update.status}`);
  } else if (!create.ok) {
    throw new Error(`Legacy state create failed for ${item.firebaseUid}: ${create.status}`);
  }
}
console.log(JSON.stringify({ migrated: items.length, skipped: skipped.length, status: "complete" }));
