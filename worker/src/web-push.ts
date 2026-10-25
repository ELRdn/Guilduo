/**
 * Web Push without a dependency: VAPID (RFC 8292) and aes128gcm payload
 * encryption (RFC 8291) on WebCrypto. The gateway keeps one VAPID key pair in
 * D1; rotating it would orphan every device, so it is created once and kept.
 */
import type { WorkerEnv } from "./worker-types.ts";

export interface PushTarget { readonly endpoint: string; readonly p256dh: string; readonly auth: string }

const encoder = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** The application server's key pair; the public half goes to `pushManager.subscribe`. */
export async function vapidKeys(env: WorkerEnv): Promise<{ publicKey: string; privateKey: CryptoKey }> {
  const db = env.QUESTFORGE_DB;
  if (!db) throw Object.assign(new Error("Push needs D1 storage."), { status: 503, code: "push_unavailable" });
  let row = await db.prepare("SELECT value_json FROM notification_keys WHERE id = 'vapid'").first<{ value_json: string }>();
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as { publicKey: CryptoKey; privateKey: CryptoKey };
    const value = { privateKey: b64url(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))), publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))) };
    // Two first requests may race; whichever insert lands is the key everyone uses.
    await db.prepare("INSERT OR IGNORE INTO notification_keys (id, value_json, created_at) VALUES ('vapid', ?, ?)").bind(JSON.stringify(value), new Date().toISOString()).run();
    row = await db.prepare("SELECT value_json FROM notification_keys WHERE id = 'vapid'").first<{ value_json: string }>();
  }
  const { privateKey, publicKey } = JSON.parse(row!.value_json) as { privateKey: string; publicKey: string };
  return { publicKey, privateKey: await crypto.subtle.importKey("pkcs8", fromB64url(privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) };
}

export async function vapidHeader(endpoint: string, keys: { publicKey: string; privateKey: CryptoKey }, subject: string, now = Date.now()): Promise<string> {
  const part = (value: unknown) => b64url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** One aes128gcm record for the subscription's keys (RFC 8291 §3–4). */
export async function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, payload: string): Promise<Uint8Array<ArrayBuffer>> {
  const receiver = fromB64url(target.p256dh);
  const sender = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as { publicKey: CryptoKey; privateKey: CryptoKey };
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey));
  const receiverKey = await crypto.subtle.importKey("raw", receiver, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, sender.privateKey, 256));
  const ikm = await hkdf(fromB64url(target.auth), shared, concat(encoder.encode("WebPush: info\0"), receiver, senderPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(encoder.encode(payload), new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = senderPublic.length;
  return concat(header, senderPublic, sealed);
}

/** Sends one message; the status tells the caller whether the device is gone (404/410). */
export async function sendPush(target: PushTarget, payload: string, keys: { publicKey: string; privateKey: CryptoKey }, subject: string, ttlSeconds: number): Promise<number> {
  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(target.endpoint, keys, subject),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(ttlSeconds),
      urgency: "high",
    },
    body: await encryptPayload(target, payload),
  });
  return response.status;
}
