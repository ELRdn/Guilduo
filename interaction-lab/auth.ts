import { beginGoogleSignIn, currentAccount, getAccessToken, refreshAccount, signOutAccount, type GuilduoUser } from "../appwrite-auth.ts";

export type Unsubscribe = () => void;
export function observeAuth(callback: (user: GuilduoUser | null) => void): Unsubscribe {
  let active = true;
  refreshAccount().then((user) => { if (active) callback(user); }).catch(() => { if (active) callback(null); });
  return () => { active = false; };
}
export async function signIn(): Promise<GuilduoUser> { return beginGoogleSignIn(); }
export async function signOutUser(): Promise<void> { await signOutAccount(); }
export const getIdToken = getAccessToken;
export function currentUser(): GuilduoUser | null { return currentAccount(); }
