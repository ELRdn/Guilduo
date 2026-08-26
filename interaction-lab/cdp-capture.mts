import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface CdpTarget {
  id: string;
  webSocketDebuggerUrl: string;
}

interface CdpError {
  message?: string;
}

interface CdpMessage {
  id?: number;
  result?: Record<string, unknown>;
  error?: CdpError;
}

interface CdpRuntimeResult {
  value?: unknown;
}

interface CdpRuntimeEvaluateResult {
  result?: CdpRuntimeResult;
  exceptionDetails?: {
    text?: string;
  };
}

interface PendingRequest {
  resolve: (message: CdpMessage) => void;
  reject: (reason: Error) => void;
}

interface CaptureClient {
  send<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  evaluate<T>(expression: string): Promise<T>;
  captureScreenshot(): Promise<Buffer>;
  close(): void;
}

interface CaptureSession {
  client: CaptureClient;
  target: CdpTarget;
  debuggerUrl: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isTarget(value: unknown): value is CdpTarget {
  const record = asRecord(value);
  return typeof record.id === "string" && typeof record.webSocketDebuggerUrl === "string";
}

async function openTarget(debuggerUrl: string, labUrl: string): Promise<CaptureSession> {
  const response = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(labUrl)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open browser target: ${response.status}`);
  const parsed: unknown = await response.json();
  if (!isTarget(parsed)) throw new Error("Chrome DevTools target did not include a WebSocket URL");

  const socket = new WebSocket(parsed.webSocketDebuggerUrl);
  const pending = new Map<number, PendingRequest>();
  let nextId = 0;

  socket.addEventListener("message", (event: MessageEvent) => {
    const messageValue: unknown = JSON.parse(String(event.data));
    const message = asRecord(messageValue) as CdpMessage;
    if (typeof message.id !== "number") return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message || "Chrome DevTools command failed"));
    } else {
      request.resolve(message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket failed")), { once: true });
  });

  const client: CaptureClient = {
    send<T = Record<string, unknown>>(
      method: string,
      params: Record<string, unknown> = {},
    ): Promise<T> {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise<T>((resolve, reject) => {
        pending.set(id, {
          resolve: (message) => resolve((message.result || {}) as T),
          reject,
        });
      });
    },
    async evaluate<T>(expression: string): Promise<T> {
      const result = await this.send<CdpRuntimeEvaluateResult>("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
      }
      return result.result?.value as T;
    },
    async captureScreenshot(): Promise<Buffer> {
      const result = await this.send<{ data?: string }>("Page.captureScreenshot", { format: "png" });
      if (typeof result.data !== "string") throw new Error("Chrome DevTools returned no screenshot data");
      return Buffer.from(result.data, "base64");
    },
    close(): void {
      socket.close();
    },
  };

  return { client, target: parsed, debuggerUrl };
}

export function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Set ${name} before running this capture.`);
  return value;
}

export async function createCaptureSession(): Promise<CaptureSession> {
  return openTarget(
    process.env.QF_LAB_DEBUG_URL || "http://127.0.0.1:9222",
    process.env.QF_LAB_URL || "http://127.0.0.1:5191/interaction-lab/",
  );
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function saveScreenshot(client: CaptureClient, path: string): Promise<void> {
  await writeFile(path, await client.captureScreenshot());
}

export function screenshotPath(outputDir: string, name: string, extension = ".png"): string {
  return join(outputDir, `${name}${extension}`);
}

export async function pause(milliseconds = 180): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function closeCaptureSession(session: CaptureSession): Promise<void> {
  try {
    await fetch(`${session.debuggerUrl}/json/close/${session.target.id}`, { method: "PUT" });
  } finally {
    session.client.close();
  }
}
