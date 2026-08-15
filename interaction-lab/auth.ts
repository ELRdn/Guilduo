import { getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  type User,
  type Unsubscribe,
  type Auth,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import firebaseConfig from "../firebase-config.js";

let auth: Auth | undefined;
let provider: GoogleAuthProvider | undefined;

function ensureAuth(): Auth {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig, "questforge-interaction-lab");
  auth ||= getAuth(app);
  provider ||= new GoogleAuthProvider();
  return auth;
}

export function observeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(ensureAuth(), callback);
}

export async function signIn(): Promise<User> {
  const currentAuth = ensureAuth();
  const result = await signInWithPopup(currentAuth, provider || new GoogleAuthProvider());
  return result.user;
}

export async function signOutUser() {
  await signOut(ensureAuth());
}

export async function getIdToken(forceRefresh = false): Promise<string> {
  const user = ensureAuth().currentUser;
  return user ? user.getIdToken(forceRefresh) : "";
}

export function currentUser(): { uid: string; email: string; displayName: string } | null {
  const user = ensureAuth().currentUser;
  return user ? { uid: user.uid, email: user.email || "", displayName: user.displayName || "" } : null;
}
