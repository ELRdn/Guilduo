import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COPY } from "../interaction-lab/all-for-adhd/copy.ts";

test("every tx() key in All for ADHD has all eight translations with matching placeholders", () => {
  const used = new Set<string>();
  for (const file of ["app.ts", "main.ts", "model.ts", "images.ts"]) {
    const source = readFileSync(new URL(`../interaction-lab/all-for-adhd/${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/tx\("((?:[^"\\]|\\.)*)"/g)) used.add(match[1]!);
  }
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
  for (const key of used) {
    const row = COPY[key];
    assert.ok(row, `missing translation: ${key}`);
    assert.equal(row.length, 8, key);
    for (const text of row) assert.equal(placeholders(text), placeholders(key), `${key} → ${text}`);
  }
  assert.deepEqual(Object.keys(COPY).filter(key => !used.has(key)), [], "unused keys");
});
