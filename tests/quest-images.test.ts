import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { createQuest, migrateState } from "../server/questforge-domain.ts";
import { requestHumanReview, respondHumanReview } from "../server/human-requests.ts";
import { prepareQuestImage, uploadQuestImage, listQuestImages, readQuestImage, removeQuestImage, questImageToolPayload, questImageToolResult, validateImageReferences, exportOwnerQuestImages, deleteOwnerQuestImages } from "../worker/src/quest-images.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import { asQuestForgeState, FakeR2Bucket, hasErrorCode, SqliteD1Database } from "./test-helpers.ts";
import { fakeImages } from "./image-fixture.ts";

const human = { uid: "owner", email: "", authType: "dev" as const, scopes: ["quests:read", "quests:write"] };
async function fixture() {
  const state = asQuestForgeState({ schemaVersion: 7, tasks: [], taskEvents: [], character: {}, battle: {}, boss: {} }); migrateState(state);
  const quest = createQuest(state, { kind: "todo", title: "Image review", assignee: { type: "agent", id: "cyan", label: "Cyan", handoffState: "working" } });
  const env: WorkerEnv = { QUESTFORGE_DB: new SqliteD1Database(), AGENT_AVATARS: new FakeR2Bucket(), IMAGES: fakeImages() };
  const bytes = await sharp({ create: { width: 1800, height: 600, channels: 3, background: "#13352f" } }).png().toBuffer();
  const input = { questId: quest.id, filename: "reference.png", sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, dryRun: false };
  return { state, quest, env, bytes, input };
}

test("original bytes, private preview, MCP image content and deletion are verified by read-back", async () => {
  const f = await fixture();
  const before = await prepareQuestImage(f.env, human, f.state, { ...f.input, dryRun: true }); assert.equal(before.dryRun, true);
  assert.equal((await listQuestImages(f.env, human, f.state, f.quest.id)).images.length, 0);
  const upload = await prepareQuestImage(f.env, human, f.state, f.input);
  assert.ok("imageId" in upload && upload.imageId);
  const request = () => new Request(`https://test${upload.uploadPath}`, { method: "PUT", headers: { authorization: `Bearer ${upload.uploadToken}` }, body: f.bytes });
  const saved = await uploadQuestImage(request(), f.env, upload.imageId, async () => f.state);
  assert.equal(saved.image.width, 1800);
  assert.equal((await uploadQuestImage(request(), f.env, upload.imageId, async () => f.state)).reused, true);
  const original = await readQuestImage(f.env, human, f.state, saved.image.id, true);
  assert.deepEqual(Buffer.from(await original.object.arrayBuffer()), f.bytes);
  const preview = await readQuestImage(f.env, human, f.state, saved.image.id);
  const info = await sharp(Buffer.from(await preview.object.arrayBuffer())).metadata(); assert.equal(info.width, 1600);
  const result = questImageToolResult(await questImageToolPayload(await readQuestImage(f.env, human, f.state, saved.image.id)));
  assert.equal(result!.content[1]!.type, "image");
  assert.ok(!JSON.stringify(result!.structuredContent).includes("base64"));
  await assert.rejects(readQuestImage(f.env, { ...human, uid: "other" }, f.state, saved.image.id), e => hasErrorCode(e, "quest_image_not_found"));
  await removeQuestImage(f.env, human, f.state, { imageId: saved.image.id, dryRun: true });
  assert.equal((await listQuestImages(f.env, human, f.state, f.quest.id)).images[0]!.deletedAt, "");
  await removeQuestImage(f.env, human, f.state, { imageId: saved.image.id, dryRun: false });
  assert.equal((await listQuestImages(f.env, human, f.state, f.quest.id)).usedBytes, 0);
  await assert.rejects(readQuestImage(f.env, human, f.state, saved.image.id), e => hasErrorCode(e, "quest_image_deleted"));
});

test("ten concurrent reservations enforce the Quest limit and all transfer bytes are validated", async () => {
  const f = await fixture();
  const reservations = await Promise.allSettled(Array.from({ length: 12 }, () => prepareQuestImage(f.env, human, f.state, f.input)));
  assert.equal(reservations.filter(r => r.status === "fulfilled").length, 10);
  const upload = reservations.find(r => r.status === "fulfilled"); assert.ok(upload?.status === "fulfilled" && "imageId" in upload.value);
  const prepared = upload.value;
  await assert.rejects(uploadQuestImage(new Request("https://test", { method: "PUT", headers: { authorization: `Bearer ${prepared.uploadToken}` }, body: Buffer.from("wrong") }), f.env, prepared.imageId!, async () => f.state), e => hasErrorCode(e, "image_hash_mismatch"));
  await assert.rejects(uploadQuestImage(new Request("https://test", { method: "PUT", headers: { authorization: "Bearer wrong" }, body: f.bytes }), f.env, prepared.imageId!, async () => f.state), e => hasErrorCode(e, "image_upload_expired"));
  await assert.rejects(prepareQuestImage(f.env, human, f.state, { ...f.input, size: 10485761 }), e => hasErrorCode(e, "quest_image_too_large"));
  await assert.rejects(prepareQuestImage(f.env, { ...human, scopes: ["quests:read"] }, f.state, f.input), e => hasErrorCode(e, "insufficient_scope"));
});

test("human response images stay private to the draft until the human answer is saved", async () => {
  const f = await fixture();
  const actor = { ownerId: "owner", requester: { type: "human" as const, id: "owner", label: "Owner" } };
  const review = requestHumanReview(f.state, f.quest.id, { requestKey: "images", title: "Check", reason: "Check", checkTarget: "Image", completionCriteria: "Answer", dryRun: false, expectedUpdatedAt: f.quest.updatedAt }, actor).quest;
  const upload = await prepareQuestImage(f.env, human, f.state, { ...f.input, context: "response", reviewQuestId: review.id }); assert.ok("imageId" in upload);
  const saved = await uploadQuestImage(new Request("https://test", { method: "PUT", headers: { authorization: `Bearer ${upload.uploadToken}` }, body: f.bytes }), f.env, upload.imageId!, async () => f.state);
  const agent = { ...human, authType: "oauth" as const, agent: { agentId: "cyan", displayName: "Cyan" } };
  assert.equal((await listQuestImages(f.env, agent, f.state, f.quest.id)).images.length, 0);
  await assert.rejects(readQuestImage(f.env, agent, f.state, saved.image.id), e => hasErrorCode(e, "quest_image_not_found"));
  await validateImageReferences(f.env, human, f.state, f.quest.id, [saved.image.id], review.id);
  respondHumanReview(f.state, review.id, { action: "revise", response: "Use this", attachmentIds: [saved.image.id], confirmed: true, expectedUpdatedAt: review.updatedAt, dryRun: false }, actor);
  assert.equal((await listQuestImages(f.env, agent, f.state, f.quest.id)).images.length, 1);
  await assert.rejects(prepareQuestImage(f.env, agent, f.state, { ...f.input, context: "response", reviewQuestId: review.id }), e => hasErrorCode(e, "human_response_required"));
});

test("stable upload IDs reconcile lost preparation and committed responses without duplicate quota", async () => {
  const f = await fixture();
  const input = { ...f.input, uploadId: crypto.randomUUID() };
  const first = await prepareQuestImage(f.env, human, f.state, input); assert.ok("imageId" in first);
  const second = await prepareQuestImage(f.env, human, f.state, input); assert.ok("imageId" in second);
  assert.equal(first.imageId, second.imageId);
  const request = (token: string) => new Request("https://test", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: f.bytes });
  await uploadQuestImage(request(second.uploadToken!), f.env, second.imageId!, async () => f.state);
  const third = await prepareQuestImage(f.env, human, f.state, input); assert.ok("imageId" in third);
  assert.equal((await uploadQuestImage(request(third.uploadToken!), f.env, third.imageId!, async () => f.state)).reused, true);
  assert.equal((await listQuestImages(f.env, human, f.state, f.quest.id)).images.length, 1);
  await assert.rejects(prepareQuestImage(f.env, human, f.state, { ...input, filename: "changed.png" }), e => hasErrorCode(e, "image_upload_conflict"));
});

test("D1/R2 image manifests restore exact bytes; owner deletion retains another owner's data", async () => {
  const f = await fixture();
  const save = async (identity: typeof human) => {
    const ticket = await prepareQuestImage(f.env, identity, f.state, f.input); assert.ok("imageId" in ticket);
    return (await uploadQuestImage(new Request("https://test", { method: "PUT", headers: { authorization: `Bearer ${ticket.uploadToken}` }, body: f.bytes }), f.env, ticket.imageId!, async () => f.state)).image;
  };
  const own = await save(human); const other = await save({ ...human, uid: "other" });
  const manifest = await exportOwnerQuestImages(f.env, human.uid); assert.equal(manifest.images.length, 1);
  const copy = new SqliteD1Database(), bucket = new FakeR2Bucket();
  const row = (f.env.QUESTFORGE_DB as SqliteD1Database).raw.prepare("SELECT * FROM quest_images WHERE id = ?").get(own.id)!;
  const columns = Object.keys(row); copy.raw.prepare(`INSERT INTO quest_images (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row));
  for (const item of manifest.images) for (const key of [item.originalKey, item.previewKey]) {
    const object = await f.env.AGENT_AVATARS!.get(key); assert.ok(object);
    const headers = new Headers(); object.writeHttpMetadata(headers);
    await bucket.put(key, await object.arrayBuffer(), { httpMetadata: { contentType: headers.get("content-type")! } });
  }
  const restored = await readQuestImage({ ...f.env, QUESTFORGE_DB: copy, AGENT_AVATARS: bucket }, human, f.state, own.id, true);
  assert.deepEqual(Buffer.from(await restored.object.arrayBuffer()), f.bytes);
  assert.equal((await deleteOwnerQuestImages(f.env, human.uid)).remaining, 0);
  await assert.rejects(readQuestImage(f.env, human, f.state, own.id), e => hasErrorCode(e, "quest_image_not_found"));
  assert.ok((await readQuestImage(f.env, { ...human, uid: "other" }, f.state, other.id)).object);
});
