import { beginGoogleSignIn, clearOAuthFailure, currentAccount, getAccessToken, resolveAuthState, signOutAccount, type GuilduoAuthState, type GuilduoUser, type SessionReadPreparation } from "../appwrite-auth.ts";

export type Unsubscribe = () => void;
export type ObservedAuthState = { status: "checking" } | GuilduoAuthState;

export function observeAuthState(callback: (state: ObservedAuthState) => void, prepareRead?: SessionReadPreparation): Unsubscribe {
  let active = true;
  callback({ status: "checking" });
  resolveAuthState(prepareRead ? (token, subject) => { if (active) prepareRead(token, subject); } : undefined)
    .then((state) => { if (active) callback(state); });
  return () => { active = false; };
}

export function observeAuth(callback: (user: GuilduoUser | null) => void): Unsubscribe {
  return observeAuthState((state) => {
    if (state.status === "authenticated") callback(state.user);
    if (state.status === "signed-out" || state.status === "oauth-failed") callback(null);
  });
}
export async function signIn(): Promise<void> { beginGoogleSignIn(); }
export async function signOutUser(): Promise<void> { await signOutAccount(); }
export const getIdToken = getAccessToken;
export function currentUser(): GuilduoUser | null { return currentAccount(); }
export const dismissOAuthFailure = clearOAuthFailure;
