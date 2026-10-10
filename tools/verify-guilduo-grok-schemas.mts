import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Validator } from "@cfworker/json-schema";
import type { Schema } from "@cfworker/json-schema";
import { digest, validateGrokMuseSource } from "./freeze-guilduo-grok-muse.mts";
import { replaceMuseQAFile } from "./guilduo-muse-safe-files.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse", "official-schemas");
await validateGrokMuseSource(root, "grok");
await mkdir(output, { recursive: true });
const results = [];
for (const name of ["plugin", "mcp"]) {
  const url = `https://agent-plugins.org/schemas/1.0.0/${name}.schema.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.ok, true, `Official schema HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const schema = JSON.parse(bytes.toString()) as Schema;
  assert.equal(schema.$id, url);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  const validator = new Validator(schema, "2020-12", false);
  const packageDocument = JSON.parse(await readFile(join(root, "plugins/guilduo-grok", `${name}.json`), "utf8"));
  const result = validator.validate(packageDocument);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(validator.validate({ ...packageDocument, unrelated_private_credential: "synthetic-only" }).valid, false);
  await replaceMuseQAFile(root, join(output, `${name}.schema.json`), bytes);
  results.push({ document: `plugins/guilduo-grok/${name}.json`, url, schemaSHA256: digest(bytes),
    packageSHA256: digest(await readFile(join(root, "plugins/guilduo-grok", `${name}.json`))),
    positive: "passed", unexpectedFieldNegative: "passed" });
}
const receipt = { checkedAt: new Date().toISOString(), draft: "2020-12", results,
  grokNativeAcceptance: "pending", cursorNativeAcceptance: "pending", modelCalls: 0, submitted: false };
await replaceMuseQAFile(root, join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
