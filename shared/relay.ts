import type { HumanRequest, QuestRequester } from "../types/questforge.ts";

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
  };
}
