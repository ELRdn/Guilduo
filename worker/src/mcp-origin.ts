import type { WorkerEnv } from "./worker-types.ts";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "worker.test"]);

function configuredValues(value: unknown): string[] {
  return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeOrigin(value: unknown): string | null {
  try {
    const url = new URL(String(value || "").trim());
    if (!url.hostname || !["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password || url.hash || url.search || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Explicit MCP origins. PUBLIC_BASE_URL remains the compatibility fallback
 * for the existing Worker/Provider OAuth deployment; new hosts belong in
 * MCP_ALLOWED_ORIGINS so they do not silently become trusted.
 */
export function configuredMcpOrigins(env: WorkerEnv): string[] {
  const values = [env.PUBLIC_BASE_URL, ...configuredValues(env.MCP_ALLOWED_ORIGINS)];
  const origins = new Set<string>();
  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

export function configuredProviderOAuthOrigins(env: WorkerEnv): string[] {
  const values = [env.PROVIDER_OAUTH_BASE_URL, env.PUBLIC_BASE_URL];
  const origins = new Set<string>();
  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

function isLocalDevelopmentOrigin(url: URL): boolean {
  return url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
}

/** Return the request origin only when it is an explicitly trusted MCP origin. */
export function mcpOriginForRequest(request: Request, env: WorkerEnv): string | null {
  const url = new URL(request.url);
  if (isLocalDevelopmentOrigin(url)) return url.origin;
  const origin = url.origin;
  return configuredMcpOrigins(env).includes(origin) ? origin : null;
}

export function providerOAuthOriginForRequest(request: Request, env: WorkerEnv): string | null {
  const url = new URL(request.url);
  if (isLocalDevelopmentOrigin(url)) return url.origin;
  const origin = url.origin;
  return configuredProviderOAuthOrigins(env).includes(origin) ? origin : null;
}

/** Safe fallback for error challenges and direct helper calls. */
export function primaryMcpOrigin(env: WorkerEnv): string {
  return configuredMcpOrigins(env)[0] || "http://localhost:8787";
}

export function mcpHostRules(env: WorkerEnv): { allowedHostnames: string[]; allowedOriginHostnames: string[] } {
  const hosts = new Set(LOCAL_HOSTNAMES);
  const origins = new Set(LOCAL_HOSTNAMES);
  for (const origin of configuredMcpOrigins(env)) {
    try {
      const hostname = new URL(origin).hostname;
      if (hostname) {
        hosts.add(hostname);
        origins.add(hostname);
      }
    } catch {
      // configuredMcpOrigins already filters malformed values
    }
  }
  return { allowedHostnames: [...hosts], allowedOriginHostnames: [...origins] };
}
