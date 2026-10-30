import type { HumanRequest, QuestRelay, QuestRequester } from "../types/questforge.ts";

export function imageIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10 || value.some(id => typeof id !== "string" || !/^[a-zA-Z0-9-]{1,120}$/.test(id)) || new Set(value).size !== value.length) throw new Error("Invalid image references.");
  return [...value];
}

export function normalizeQuestRelay(value: unknown): QuestRelay | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const relay = value as QuestRelay;
  if (!Array.isArray(relay.legs) || relay.legs.length > 6 || !Number.isInteger(relay.at) || relay.at < 0 || relay.at > relay.legs.length) return null;
  if (relay.legs.some(leg => !leg || typeof leg.id !== "string" || typeof leg.agentId !== "string" || typeof leg.ask !== "string" || typeof leg.check !== "boolean")) return null;
  return structuredClone(relay);
}

export function nextQuestTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
}

export function normalizeRequester(value: unknown): QuestRequester | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const actor = value as Record<string, unknown>;
  if (!["human", "agent"].includes(String(actor.type)) || typeof actor.id !== "string" || !actor.id.trim()) return null;
  return { type: actor.type as QuestRequester["type"], id: actor.id.trim().slice(0, 120), label: String(actor.label || actor.id).trim().slice(0, 80) };
}

export function normalizeHumanRequest(value: unknown): HumanRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (typeof request.sourceQuestId !== "string" || !request.sourceQuestId || typeof request.requestKey !== "string" || !request.requestKey
    || typeof request.recipientId !== "string" || !request.recipientId || !["pending", "deferred", "answered"].includes(String(request.status))) return null;
  return {
    sourceQuestId: request.sourceQuestId, requestKey: request.requestKey, recipientId: request.recipientId,
    reason: String(request.reason || ""), checkTarget: String(request.checkTarget || ""), artifactUrl: String(request.artifactUrl || ""),
    status: request.status as HumanRequest["status"], seenAt: String(request.seenAt || ""), respondedAt: String(request.respondedAt || ""),
    response: String(request.response || ""), outcome: ["approved", "changes_requested"].includes(String(request.outcome)) ? request.outcome as HumanRequest["outcome"] : "",
    ...(request.attachmentIds === undefined ? {} : { attachmentIds: imageIds(request.attachmentIds) }),
    ...(request.responseAttachmentIds === undefined ? {} : { responseAttachmentIds: imageIds(request.responseAttachmentIds) }),
  };
}
