/**
 * Orphan inventory and cleanup for Agent avatar assets.
 *
 * `agent-avatar-store.ts` never overwrites an R2 object and never deletes a
 * superseded one on a normal avatar replace (see PRIVACY.md) — only the one
 * narrow case where a losing D1 CAS orphans the object it just wrote (see
 * `index.ts`'s avatar PUT handler and P2-4). Everything else a losing race
 * or a replace ever wrote stays in R2 forever unless this module removes it.
 *
 * This never runs on the request-serving path. `planAgentAvatarCleanup` first
 * classifies every object under `agents/avatars/` against
 * every `avatar_asset_id` D1 currently references (active *or* archived —
 * an archived Agent's row, and the avatar it points at, are retained
 * indefinitely, matching the "delete より保管する" product principle in
 * PROJECT_SPEC.md, not treated as eligible for cleanup). It only deletes
 * anything when called with `execute: true`, and only ever an object that is
 * both unreferenced *and* older than `graceHours` — the grace period exists
 * so an asset a request just wrote (and hasn't activated in D1 yet, or is
 * mid-cleanup itself after losing its own CAS) is never treated as an
 * orphan out from under a request still in flight.
 */

import { assetIdFromAvatarKey, AVATAR_KEY_PREFIX, deleteAgentAvatarAsset } from "./agent-avatar-store.ts";
import type { D1DatabaseLike, JsonRecord, WorkerEnv } from "./worker-types.ts";

export interface AvatarCleanupCandidate {
  readonly key: string;
  readonly assetId: string;
  readonly sizeBytes: number;
  readonly uploaded: string;
  readonly ageHours: number;
  /** R2's ETag for the object — a real content checksum for non-multipart uploads (all avatar uploads are single-shot puts), not a fabricated one. */
  readonly checksum: string;
}

export interface AvatarCleanupSkipped {
  readonly key: string;
  readonly reason: "active_reference" | "active_reference_recheck" | "within_grace_period";
}

export interface AvatarCleanupReport {
  readonly status: "ready" | "blocked";
  readonly blockedReason: "r2_unavailable" | "d1_unavailable" | "d1_reference_scan_failed" | null;
  readonly blockedErrorCode: string | null;
  readonly mode: "dry-run" | "execute";
  readonly scannedObjects: number;
  readonly activeReferences: number;
  readonly graceHours: number;
  readonly candidates: AvatarCleanupCandidate[];
  readonly skipped: AvatarCleanupSkipped[];
  /** Populated only in "execute" mode — the subset of `candidates` actually deleted; a candidate can be missing here if its own delete failed (see `deletionErrors`). */
  readonly deleted: string[];
  readonly deletionErrors: Array<{ key: string; errorCode: string }>;
  readonly referenceCheckErrors: Array<{ key: string; errorCode: string }>;
}

export interface AvatarCleanupOptions {
  /** Defaults to false (report only). Deleting anything requires opting in explicitly — see AGENT_AVATAR_CLEANUP_EXECUTE in index.ts's scheduled() wiring. */
  execute?: boolean;
  /** Defaults to 24h. An orphan younger than this is always skipped, regardless of `execute`. */
  graceHours?: number;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  now?: Date;
  /** Caps how many R2 list pages this pass walks in one call, so a very large bucket cannot make one scheduled invocation run unbounded. */
  maxPages?: number;
}

function cleanupErrorCode(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : fallback;
}

async function referencedAssetIds(db: D1DatabaseLike): Promise<Set<string>> {
  const referenced = new Set<string>();
  const rows = (await db.prepare(
    "SELECT DISTINCT avatar_asset_id FROM agent_registry_agents WHERE avatar_asset_id IS NOT NULL",
  ).all<JsonRecord>()).results || [];
  for (const row of rows) {
    const assetId = row.avatar_asset_id;
    if (typeof assetId === "string" && assetId !== "") referenced.add(assetId);
  }
  return referenced;
}

async function isAssetReferenced(db: D1DatabaseLike, assetId: string): Promise<boolean> {
  const row = await db.prepare(
    "SELECT 1 AS referenced FROM agent_registry_agents WHERE avatar_asset_id = ? LIMIT 1",
  ).bind(assetId).first<JsonRecord>();
  return row !== null;
}

export async function planAgentAvatarCleanup(env: WorkerEnv, options: AvatarCleanupOptions = {}): Promise<AvatarCleanupReport> {
  const execute = options.execute === true;
  const graceHours = options.graceHours ?? 24;
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? 20;
  if (!Number.isFinite(graceHours) || graceHours < 0) throw new RangeError("graceHours must be a finite number greater than or equal to 0.");
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new RangeError("maxPages must be a positive integer.");
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid Date.");

  const report: AvatarCleanupReport = {
    status: "ready",
    blockedReason: null,
    blockedErrorCode: null,
    mode: execute ? "execute" : "dry-run",
    scannedObjects: 0,
    activeReferences: 0,
    graceHours,
    candidates: [],
    skipped: [],
    deleted: [],
    deletionErrors: [],
    referenceCheckErrors: [],
  };
  if (!env.AGENT_AVATARS) return { ...report, status: "blocked", blockedReason: "r2_unavailable" };
  if (!env.QUESTFORGE_DB) return { ...report, status: "blocked", blockedReason: "d1_unavailable" };

  let referenced: Set<string>;
  try {
    referenced = await referencedAssetIds(env.QUESTFORGE_DB);
  } catch (error) {
    return {
      ...report,
      status: "blocked",
      blockedReason: "d1_reference_scan_failed",
      blockedErrorCode: cleanupErrorCode(error, "reference_scan_failed"),
    };
  }
  const activeReferences = new Set(referenced);
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await env.AGENT_AVATARS.list({ prefix: AVATAR_KEY_PREFIX, cursor, limit: 1000 });
    pages += 1;
    for (const object of page.objects) {
      const mutableReport = report as { scannedObjects: number; activeReferences: number; candidates: AvatarCleanupCandidate[]; skipped: AvatarCleanupSkipped[] };
      mutableReport.scannedObjects += 1;
      const assetId = assetIdFromAvatarKey(object.key);
      if (assetId === null) continue; // Not an avatar object at all — outside this pass's scope.
      if (activeReferences.has(assetId)) {
        mutableReport.activeReferences += 1;
        mutableReport.skipped.push({ key: object.key, reason: "active_reference" });
        continue;
      }
      const ageHours = (now.getTime() - object.uploaded.getTime()) / (60 * 60 * 1000);
      if (ageHours < graceHours) {
        mutableReport.skipped.push({ key: object.key, reason: "within_grace_period" });
        continue;
      }
      mutableReport.candidates.push({
        key: object.key,
        assetId,
        sizeBytes: object.size,
        uploaded: object.uploaded.toISOString(),
        ageHours: Math.round(ageHours * 100) / 100,
        checksum: object.httpEtag ?? object.etag ?? "",
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined && pages < maxPages);

  if (!execute) return report;

  const deleted: string[] = [];
  const deletionErrors: Array<{ key: string; errorCode: string }> = [];
  const referenceCheckErrors: Array<{ key: string; errorCode: string }> = [];
  const skipped = [...report.skipped];
  for (const candidate of report.candidates) {
    try {
      if (await isAssetReferenced(env.QUESTFORGE_DB, candidate.assetId)) {
        skipped.push({ key: candidate.key, reason: "active_reference_recheck" });
        continue;
      }
    } catch (error) {
      referenceCheckErrors.push({ key: candidate.key, errorCode: cleanupErrorCode(error, "reference_check_failed") });
      continue;
    }
    try {
      await deleteAgentAvatarAsset(env, candidate.assetId);
      deleted.push(candidate.key);
    } catch (error) {
      deletionErrors.push({ key: candidate.key, errorCode: cleanupErrorCode(error, "delete_failed") });
    }
  }
  return { ...report, skipped, deleted, deletionErrors, referenceCheckErrors };
}
