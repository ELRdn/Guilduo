import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { startRelayWorkerFixture } from "./browser/worker-fixture.ts";
import { fakeImages } from "./image-fixture.ts";
import { SqliteD1Database } from "./test-helpers.ts";
import { createAgent, getAgent, updateAgent } from "../worker/src/agent-store.ts";
import type { ImageUploadTicket } from "../types/quest-images.ts";
import type { QuestImage } from "../types/questforge.ts";

test("actual Worker HTTP and both MCP transports preserve image content and recheck revoked Agent uploads", async () => {
  const fixture = await startRelayWorkerFixture("http://127.0.0.1:5173", { QUESTFORGE_DB: new SqliteD1Database(), IMAGES: fakeImages() });
  try {
    const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#b89a5e" } }).png().toBuffer();
    const args = { questId: fixture.first.source.id, filename: "result.png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), context: "result", dryRun: false };
    const ticket = await fixture.mcp("prepare_quest_image_upload", args) as unknown as ImageUploadTicket;
    assert.ok(ticket.uploadToken);
    const uploaded = await fetch(fixture.baseUrl + ticket.uploadPath, { method: "PUT", headers: { authorization: `Bearer ${ticket.uploadToken}` }, body: bytes });
    assert.equal(uploaded.status, 200, await uploaded.clone().text());
    const image = (await uploaded.json() as { image: QuestImage }).image;
    const web = await fetch(`${fixture.baseUrl}/v1/quest-images/${image.id}?variant=original`, { headers: { authorization: `Bearer ${fixture.humanToken}` } });
    assert.deepEqual(Buffer.from(await web.arrayBuffer()), bytes); assert.equal(web.headers.get("cache-control"), "private, no-store");
    for (const path of ["/mcp", "/mcp-next"]) {
      const response = await fetch(fixture.baseUrl + path, { method: "POST", headers: { authorization: `Bearer ${fixture.agentToken}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: "image", method: "tools/call", params: { name: "read_quest_image", arguments: { imageId: image.id } } }) });
      const text = await response.text();
      const parsed = JSON.parse(text.startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6)) as { result: { isError: boolean; content: { type: string; data?: string }[]; structuredContent: { image: QuestImage } } };
      assert.equal(parsed.result.isError, false, text); assert.equal(parsed.result.content[1]!.type, "image", path);
      assert.equal(parsed.result.structuredContent.image.sha256, args.sha256);
      assert.equal((await sharp(Buffer.from(parsed.result.content[1]!.data!, "base64")).metadata()).format, "webp");
    }
    const source = await fixture.mcp("get_quest", { questId: fixture.first.source.id }); assert.ok((source.quest.images as QuestImage[]).some(item => item.id === image.id));
    const revoked = await fixture.mcp("prepare_quest_image_upload", args) as unknown as ImageUploadTicket;
    const agent = await getAgent(fixture.env, fixture.uid, "review-agent");
    await updateAgent(fixture.env, fixture.uid, agent.agentId, { status: "disabled", expectedUpdatedAt: agent.updatedAt });
    const denied = await fetch(fixture.baseUrl + revoked.uploadPath, { method: "PUT", headers: { authorization: `Bearer ${revoked.uploadToken}` }, body: bytes });
    assert.equal(denied.status, 403);
  } finally { await fixture.close(); }
});

test("Worker MCP and REST relay callers retain required reviews, current identity and explicit completion", async () => {
  const fixture = await startRelayWorkerFixture("http://127.0.0.1:5173", { QUESTFORGE_DB: new SqliteD1Database() });
  const id = fixture.first.source.id;
  async function approve(reviewId: string) {
    const { quest } = await fixture.web(`/v1/quests/${reviewId}`);
    await fixture.web(`/v1/quests/${reviewId}/review-response`, "POST", { action: "approve", response: "Fixture checked", confirmed: true, expectedUpdatedAt: quest.updatedAt, dryRun: false });
  }
  try {
    await approve(fixture.first.quest.id);
    await createAgent(fixture.env, fixture.uid, { agentId: "relay-next", displayName: "Next fixture Agent", allowedScopes: ["quests:read", "quests:write"], reviewRequired: false });
    const source = (await fixture.web(`/v1/quests/${id}`)).quest;
    const input = { questId: id, legs: [{ agentId: "review-agent", ask: "Build", check: false }, { agentId: "relay-next", ask: "Review", check: false }], expectedUpdatedAt: source.updatedAt };
    const preview = await fixture.mcp("set_quest_relay", { ...input, dryRun: true });
    assert.equal(preview.quest.relay!.legs.length, 2);
    assert.equal((await fixture.web(`/v1/quests/${id}`)).quest.relay, undefined);
    const configured = await fixture.mcp("set_quest_relay", { ...input, dryRun: false });
    await assert.rejects(fixture.web(`/v1/quests/${id}`, "PATCH", { lifecycleState: "completed", expectedUpdatedAt: configured.quest.updatedAt }), /relay_incomplete/);
    const report = await fixture.mcp("advance_quest_relay", { questId: id, legId: configured.quest.relay!.legs[0]!.id, operationId: "build", note: "Built", expectedUpdatedAt: configured.quest.updatedAt, dryRun: false });
    assert.equal(report.quest.relay!.at, 0, "Registry policy requires a saved Human approval even with check=false");
    await approve(report.quest.relay!.legs[0]!.reviewQuestId!);
    let current = (await fixture.web(`/v1/quests/${id}`)).quest;
    const next = await fixture.mcp("advance_quest_relay", { questId: id, legId: current.relay!.legs[0]!.id, operationId: "forward", expectedUpdatedAt: current.updatedAt, dryRun: false });
    assert.equal(next.quest.assignee.id, "relay-next"); assert.equal(next.quest.assignee.handoffState, "ready");
    const finalInput = { legId: next.quest.relay!.legs[1]!.id, operationId: "final", note: "Final fixture report", expectedUpdatedAt: next.quest.updatedAt, dryRun: false };
    await assert.rejects(fixture.mcp("advance_quest_relay", { questId: id, ...finalInput }), /quest_assignee_mismatch/);
    const reviewed = await fixture.web(`/v1/quests/${id}/relay/advance`, "POST", finalInput);
    assert.equal(reviewed.quest.relay!.at, 1, "The final stage requires review even for a review-free Agent");
    await approve(reviewed.quest.relay!.legs[1]!.reviewQuestId!);
    current = (await fixture.web(`/v1/quests/${id}`)).quest;
    const accepted = await fixture.web(`/v1/quests/${id}/relay/advance`, "POST", { legId: current.relay!.legs[1]!.id, operationId: "accept", expectedUpdatedAt: current.updatedAt, dryRun: false });
    assert.equal(accepted.quest.relay!.at, 2); assert.equal(accepted.quest.assignee.handoffState, "accepted"); assert.equal(accepted.quest.done, false);
  } finally { await fixture.close(); }
});
