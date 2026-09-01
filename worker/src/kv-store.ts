import type { KvNamespaceLike, WorkerEnv } from "./worker-types.ts";

type MemoryKvValue = { value: string; expiresAt: number };
const memoryKv = new Map<string, MemoryKvValue>();

function jsonValue(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export function getKv(env: WorkerEnv): KvNamespaceLike {
  if (env.QUESTFORGE_KV) return env.QUESTFORGE_KV;
  return {
    async get<T = unknown>(key: string, type?: "text" | "json"): Promise<T | null> {
      const item = memoryKv.get(key);
      if (!item || (item.expiresAt && item.expiresAt < Date.now())) {
        memoryKv.delete(key);
        return null;
      }
      return (type === "json" ? jsonValue(item.value) : item.value) as T;
    },
    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
      memoryKv.set(key, {
        value: String(value),
        expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0,
      });
    },
    async delete(key: string): Promise<void> { memoryKv.delete(key); },
    async list({ prefix = "" }: { prefix?: string } = {}): Promise<{ keys: Array<{ name: string }> }> {
      return { keys: [...memoryKv.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
    },
  };
}
