import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizePartyMembers } from "../interaction-lab/relay-forge/production.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Party exposes Agent registration and editing through the production repository", () => {
  const party = read("interaction-lab/relay-forge/screens/party.ts");
  const production = read("interaction-lab/relay-forge/production.ts");
  const shell = read("interaction-lab/relay-forge/shell.ts");
  const repository = read("interaction-lab/repository.ts");

  assert.match(repository, /async createAgent\(/);
  assert.match(repository, /async updateAgent\(/);
  assert.match(production, /readonly agentPort:/);
  assert.match(production, /agentPort: repository/);
  assert.match(production, /!members\.some\(\(member\) => member\.uid === selfUid\)/);
  assert.match(production, /displayName: "あなた"/);
  assert.match(shell, /runtime\.agentPort\.createAgent/);
  assert.match(shell, /runtime\.agentPort\.updateAgent/);
  assert.match(shell, /expectedUpdatedAt: existing\?\.updatedAt/);
  assert.match(shell, /resolveActors\(profile, sharedAgents/);
  assert.match(party, /Agentを登録/);
  assert.match(party, /Agentを編集/);
});

test("Party always contains the signed-in Human exactly once", () => {
  const empty = normalizePartyMembers({}, "appwrite-user", { uid: "appwrite-user", displayName: "Hironao" });
  assert.deepEqual(empty, [{
    uid: "appwrite-user",
    displayName: "Hironao",
    handle: "",
    role: "owner",
    joinedAt: "",
    level: 0,
  }]);

  const existing = normalizePartyMembers({
    members: [{ uid: "appwrite-user", displayName: "Hironao", handle: "hironao", role: "owner" }],
  }, "appwrite-user", { uid: "appwrite-user", displayName: "Hironao" });
  assert.equal(existing.filter((member) => member.uid === "appwrite-user").length, 1);
});
