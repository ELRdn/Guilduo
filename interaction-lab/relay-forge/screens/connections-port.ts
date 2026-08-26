/**
 * Connections ports and the adapter scope table.
 *
 * `REQUIRED_SCOPES` mirrors `minimumScopes` in `api/integration-adapters.json`,
 * which is a compatibility boundary (AGENTS.md). It is duplicated here rather
 * than imported so the browser bundle does not pull a contract file in, and a
 * unit test asserts the two stay identical — if the contract changes and this
 * table does not, the test fails rather than the screen quietly lying about
 * which permissions a service needs.
 *
 * `FixtureConnectionsPort` produces deterministic outcomes for the state matrix.
 * It never fabricates a success: a preview returns counts, and an execution only
 * reports what the preview said it would do.
 *
 * `RepositoryConnectionsPort` calls the real endpoints. No token, code or
 * authorization URL passes through this module in either direction.
 */

import type { ConnectionActionResult, ConnectionsPort } from "./connections-model.ts";

/** Keyed by adapter id. Source of truth: api/integration-adapters.json. */
export const REQUIRED_SCOPES: Readonly<Record<string, readonly string[]>> = {
  "google-calendar": [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ],
  "google-tasks": ["https://www.googleapis.com/auth/tasks"],
  "toggl-focus": [],
  "toggl-track": [],
  // The Notion adapter declares no `minimumScopes` in the contract file. An
  // absent list is an empty list here, never an unknown one.
  notion: [],
};

export type ConnectionFailure = "none" | "permission" | "network" | "conflict";

const FAILURE_COPY: Readonly<Record<string, string>> = {
  insufficient_scope: "この操作に必要なスコープが付与されていません。",
  offline: "接続がありません。復帰してからやり直してください。",
  integration_conflict: "別のセッションがこの接続を更新しました。最新を読み込んでください。",
  reconnect_required: "アクセス権が失効しています。先に再接続してください。",
};

function failure(code: string): ConnectionActionResult {
  return { ok: false, code, message: FAILURE_COPY[code] ?? "操作を完了できませんでした。" };
}

export class FixtureConnectionsPort implements ConnectionsPort {
  private inFlight = false;

  constructor(private readonly mode: ConnectionFailure = "none") {}

  private guard(): ConnectionActionResult | null {
    if (this.mode === "permission") return failure("insufficient_scope");
    if (this.mode === "network") return failure("offline");
    if (this.mode === "conflict") return failure("integration_conflict");
    if (this.inFlight) return { ok: false, code: "busy", message: "実行中です。完了までお待ちください。" };
    return null;
  }

  /* Deterministic counts derived from the adapter id, so the same preview
   * appears in every capture run rather than a random number. */
  private counts(id: string): { imported: number; updated: number; skipped: number } {
    const seed = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return { imported: seed % 5, updated: seed % 3, skipped: seed % 2 };
  }

  async previewSync(id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    return {
      ok: true,
      code: "preview_ok",
      message: "確認のみ実行しました。まだ何も書き込んでいません。",
      preview: this.counts(id),
    };
  }

  async runSync(id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    this.inFlight = true;
    try {
      // The execution reports exactly what the preview promised: the same
      // counts, from the same function, not a second independent calculation.
      const counts = this.counts(id);
      return {
        ok: true,
        code: "sync_ok",
        message: `同期しました。取り込み ${counts.imported}件、更新 ${counts.updated}件。`,
      };
    } finally {
      this.inFlight = false;
    }
  }

  async reconnect(_id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    /* A real reconnect leaves the app for the provider's consent screen. The
     * fixture says so rather than pretending the connection is now live. */
    return {
      ok: true,
      code: "reconnect_started",
      message: "再接続を開始しました。プロバイダの許可画面で承認すると接続が回復します。",
    };
  }

  async disconnect(_id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    this.inFlight = true;
    try {
      return {
        ok: true,
        code: "disconnect_ok",
        message: "接続を解除しました。Questは削除されていません。",
      };
    } finally {
      this.inFlight = false;
    }
  }
}

/** The subset of `QuestForgeRepository` this screen needs. */
export interface ConnectionsRepository {
  previewSync(service: string, direction?: string): Promise<Record<string, unknown>>;
  syncService(service: string, direction?: string): Promise<Record<string, unknown>>;
  connectIntegration(service: string): Promise<Record<string, unknown>>;
  disconnectIntegration(service: string): Promise<Record<string, unknown>>;
}

function counts(result: Record<string, unknown>): ConnectionActionResult["preview"] {
  const read = (key: string): number => (typeof result[key] === "number" ? result[key] as number : 0);
  return { imported: read("imported"), updated: read("updated"), skipped: read("skipped") };
}

export class RepositoryConnectionsPort implements ConnectionsPort {
  constructor(private readonly repository: ConnectionsRepository) {}

  private async call(
    work: () => Promise<Record<string, unknown>>,
    code: string,
    message: string,
    withPreview = false,
  ): Promise<ConnectionActionResult> {
    try {
      const result = await work();
      return withPreview
        ? { ok: true, code, message, preview: counts(result) }
        : { ok: true, code, message };
    } catch (error) {
      const domain = error as { code?: string; status?: number };
      return failure(domain.code ?? `http_${domain.status ?? 0}`);
    }
  }

  previewSync(id: string): Promise<ConnectionActionResult> {
    return this.call(() => this.repository.previewSync(id), "preview_ok", "確認のみ実行しました。", true);
  }

  runSync(id: string): Promise<ConnectionActionResult> {
    return this.call(() => this.repository.syncService(id), "sync_ok", "同期しました。");
  }

  reconnect(id: string): Promise<ConnectionActionResult> {
    return this.call(
      () => this.repository.connectIntegration(id),
      "reconnect_started",
      "再接続を開始しました。プロバイダの許可画面で承認してください。",
    );
  }

  disconnect(id: string): Promise<ConnectionActionResult> {
    return this.call(
      () => this.repository.disconnectIntegration(id),
      "disconnect_ok",
      "接続を解除しました。Questは削除されていません。",
    );
  }
}
