import test from "node:test";
import assert from "node:assert/strict";
import { PreparedTransaction } from "../worker/src/prepared-transaction.ts";

test("an empty slot does not block a save on another request's pending I/O", async () => {
  const slot = new PreparedTransaction();
  let resolve!: (id: string) => void;
  let created = 0;
  const pending = slot.prepare(() => { created++; return new Promise(r => { resolve = r; }); });
  await slot.prepare(async () => { created++; return "duplicate"; });
  assert.equal(created, 1);
  assert.equal(slot.take(), undefined);
  resolve("empty-1"); await pending;
  await slot.prepare(async () => { created++; return "duplicate"; });
  assert.equal(created, 1);
  const claims = await Promise.all([Promise.resolve().then(() => slot.take()), Promise.resolve().then(() => slot.take())]);
  assert.deepEqual(claims, ["empty-1", undefined]);
  await slot.prepare(async () => "empty-2");
  assert.equal(slot.take(), "empty-2");
});

test("age includes creation time and expired or failed preparations never reach a save", async () => {
  let now = 0;
  const slot = new PreparedTransaction(() => now);
  await slot.prepare(async () => { now = 10000; return "first"; });
  now = 30000;
  assert.equal(slot.take(), undefined);
  await slot.prepare(async () => { now += 30000; return "too-slow"; });
  assert.equal(slot.take(), undefined);
  await slot.prepare(async () => { throw new Error("private service detail"); });
  assert.equal(slot.take(), undefined);
  await slot.prepare(async () => "recovered");
  now += 29999;
  assert.equal(slot.take(), "recovered");
  assert.equal(slot.take(), undefined);
});
