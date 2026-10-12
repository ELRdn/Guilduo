import { Validator } from "@cfworker/json-schema";
import type { ValidationResult } from "@cfworker/json-schema";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"] as const;

type McpId = string | number;
type McpMessage = { method: string; params: Record<string, unknown> };
export type McpEnvelopeValidation =
  | { kind: "request"; message: McpMessage & { id: McpId } }
  | { kind: "notification"; message: McpMessage }
  | { kind: "error"; id: McpId | null; error: { code: number; message: string } };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is McpId {
  return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}

/** Call before body parsing or any tool dispatch. No Origin means a native client. */
export function validateMcpHttpRequest(request: Request, allowedOrigins: string | readonly string[]): Response | null {
  const origin = request.headers.get("origin");
  const allowed = typeof allowedOrigins === "string" ? allowedOrigins.split(",").map(item => item.trim()) : allowedOrigins;
  if (origin !== null && !allowed.some(item => {
    try {
      const url = new URL(item);
      return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
        && url.href === `${url.origin}/` && url.origin === origin;
    } catch { return false; }
  })) return new Response("Origin not allowed", { status: 403 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  const protocol = request.headers.get("mcp-protocol-version");
  if (protocol !== null && !MCP_SUPPORTED_PROTOCOL_VERSIONS.some(version => version === protocol)) {
    return new Response("Unsupported MCP protocol version", { status: 400 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return new Response("Use application/json", { status: 415 });
  }
  return null;
}

/** Malformed JSON should return JSON-RPC -32700 separately, before this helper. */
export function validateMcpEnvelope(value: unknown): McpEnvelopeValidation {
  const invalid = (id: McpId | null, code: number, message: string): McpEnvelopeValidation => ({ kind: "error", id, error: { code, message } });
  if (!isObject(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string" || !value.method
    || "result" in value || "error" in value || ("id" in value && !isId(value.id))) {
    return invalid(null, -32600, "Invalid JSON-RPC request");
  }
  const id = isId(value.id) ? value.id : null;
  if ("params" in value && !isObject(value.params)) return invalid(id, -32602, "MCP params must be an object");
  const params = isObject(value.params) ? value.params : {};
  if (value.method.startsWith("notifications/")) {
    if ("id" in value) return invalid(id, -32600, "Notifications must not include an id");
    // Notifications are acknowledged and never dispatched as tool requests.
    return { kind: "notification", message: { method: value.method, params } };
  }
  if (id === null) return invalid(null, -32600, "MCP requests must include a string or integer id");
  if (value.method === "tools/call" && (typeof params.name !== "string" || !params.name.trim()
    || ("arguments" in params && !isObject(params.arguments)))) {
    return invalid(id, -32602, "tools/call requires a name and object arguments");
  }
  if (value.method === "tools/list" && "cursor" in params && typeof params.cursor !== "string") {
    return invalid(id, -32602, "tools/list cursor must be a string");
  }
  if (value.method === "initialize" && (typeof params.protocolVersion !== "string" || !params.protocolVersion
    || !isObject(params.capabilities) || !isObject(params.clientInfo)
    || typeof params.clientInfo.name !== "string" || !params.clientInfo.name
    || typeof params.clientInfo.version !== "string" || !params.clientInfo.version)) {
    return invalid(id, -32602, "initialize requires protocolVersion, capabilities and clientInfo");
  }
  return { kind: "request", message: { id, method: value.method, params } };
}

/** Unknown requested versions negotiate the latest supported version, as MCP specifies. */
export function negotiateMcpProtocolVersion(requested: unknown): string {
  return MCP_SUPPORTED_PROTOCOL_VERSIONS.find(version => version === requested) ?? MCP_PROTOCOL_VERSION;
}

export function mcpPingResponse(id: McpId): { jsonrpc: "2.0"; id: McpId; result: Record<string, never> } {
  return { jsonrpc: "2.0", id, result: {} };
}

/** Validate the declared schema unchanged; do not strip extras or insert defaults. */
export function validateMcpToolInput(inputSchema: Record<string, unknown>, args: unknown): ValidationResult {
  return new Validator(inputSchema, "2020-12").validate(args);
}
