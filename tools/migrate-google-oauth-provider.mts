import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const required = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_PROJECT_ID",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
] as const;
for (const name of required) {
  if (!String(process.env[name] || "").trim()) throw new Error(`Missing environment variable: ${name}`);
}

const serviceAccount = JSON.parse(await readFile(String(process.env.GOOGLE_APPLICATION_CREDENTIALS), "utf8")) as {
  client_email?: string;
  private_key?: string;
};
if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error("Firebase service account is incomplete.");

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
  iss: serviceAccount.client_email,
  scope: "https://www.googleapis.com/auth/identitytoolkit",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 3600,
})}`;
const signer = createSign("RSA-SHA256");
signer.update(unsigned);
signer.end();
const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key).toString("base64url")}`;

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});
if (!tokenResponse.ok) throw new Error(`Google access token request failed: ${tokenResponse.status}`);
const tokenPayload = await tokenResponse.json() as { access_token?: string };
if (!tokenPayload.access_token) throw new Error("Google access token response did not include a token.");

const firebaseConfigResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(String(process.env.FIREBASE_PROJECT_ID))}/defaultSupportedIdpConfigs/google.com`,
  { headers: { authorization: `Bearer ${tokenPayload.access_token}` } },
);
if (!firebaseConfigResponse.ok) throw new Error(`Firebase Google provider lookup failed: ${firebaseConfigResponse.status}`);
const firebaseConfig = await firebaseConfigResponse.json() as { enabled?: boolean; clientId?: string; clientSecret?: string };
if (!firebaseConfig.enabled || !firebaseConfig.clientId || !firebaseConfig.clientSecret) {
  throw new Error("Firebase Google provider is not enabled or its credentials are unavailable.");
}

const endpoint = String(process.env.APPWRITE_ENDPOINT).replace(/\/$/, "");
const appwriteResponse = await fetch(`${endpoint}/project/oauth2/google`, {
  method: "PATCH",
  headers: {
    "content-type": "application/json",
    "x-appwrite-project": String(process.env.APPWRITE_PROJECT_ID),
    "x-appwrite-key": String(process.env.APPWRITE_API_KEY),
  },
  body: JSON.stringify({
    clientId: firebaseConfig.clientId,
    clientSecret: firebaseConfig.clientSecret,
    prompt: ["consent"],
    enabled: true,
  }),
});
if (!appwriteResponse.ok) throw new Error(`Appwrite Google provider update failed: ${appwriteResponse.status}`);
const result = await appwriteResponse.json() as { $id?: string; enabled?: boolean };
if (result.$id !== "google" || result.enabled !== true) throw new Error("Appwrite did not confirm the Google provider as enabled.");

console.log(JSON.stringify({ provider: "google", source: "firebase", destination: "appwrite", enabled: true }));
