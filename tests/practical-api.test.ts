import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { startRelayWorkerFixture } from "./browser/worker-fixture.ts";
import { fakeImages } from "./image-fixture.ts";
import { SqliteD1Database } from "./test-helpers.ts";
import { getAgent, updateAgent } from "../worker/src/agent-store.ts";
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
