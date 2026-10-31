import test from "node:test";
import assert from "node:assert/strict";
import { reviewImages } from "../interaction-lab/all-for-adhd/model.ts";
import type { QuestImage } from "../types/questforge.ts";

const image = (id: string, context: QuestImage["context"], reviewQuestId = ""): QuestImage => ({
  id, questId: "source", context, reviewQuestId, legId: "", filename: `${id}.png`, caption: "", contentType: "image/png", size: 100,
  previewSize: 50, width: 100, height: 100, sha256: "a".repeat(64), createdAt: "2026-10-30T00:00:00Z", createdBy: { type: "agent", id: "fixture", label: "Fixture" }, deletedAt: "",
});

test("a review without explicit image IDs shows source references/results and its request, keeping response drafts separate", () => {
  const images = [image("reference", "reference"), image("result", "result"), image("current", "request", "review"), image("other", "request", "another-review"), image("response", "response", "review")];
  assert.deepEqual(reviewImages(images, "review").map(item => item.id), ["reference", "result", "current"]);
  assert.deepEqual(reviewImages(images, "review", []).map(item => item.id), ["reference", "result", "current"]);
  assert.deepEqual(reviewImages(images, "source").map(item => item.id), ["reference", "result"]);
});

test("explicit image selection remains authoritative and retains deleted-image markers", () => {
  const images = [image("reference", "reference"), { ...image("selected", "result"), deletedAt: "2026-10-30T01:00:00Z" }];
  const selected = reviewImages(images, "review", ["selected"]);
  assert.deepEqual(selected, [images[1]]);
  assert.equal(selected[0]!.deletedAt, "2026-10-30T01:00:00Z");
  assert.equal(images.length, 2);
});
