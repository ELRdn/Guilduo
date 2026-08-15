import type { QuestForgeState } from "../types/questforge.ts";

export type TestRequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

export type TestContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type JsonRecord = Record<string, unknown>;

export type ErrorWithCode = Error & {
  code?: string;
};

export function asQuestForgeState<T>(state: T): QuestForgeState {
  return state as unknown as QuestForgeState;
}

export async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

export function asError(error: unknown): ErrorWithCode {
  return error instanceof Error ? error as ErrorWithCode : new Error(String(error));
}

export function required<T>(value: T | null | undefined, label = "value"): T {
  if (value === null || value === undefined) throw new Error(`${label} was unexpectedly empty.`);
  return value;
}
