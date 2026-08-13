import { getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import firebaseConfig from "../firebase-config.js";

let auth;
let provider;

function ensureAuth() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig, "questforge-interaction-lab");
  auth ||= getAuth(app);
  provider ||= new GoogleAuthProvider();
  return auth;
}

export function observeAuth(callback) {
  return onAuthStateChanged(ensureAuth(), callback);
}

export async function signIn() {
  const currentAuth = ensureAuth();
  const result = await signInWithPopup(currentAuth, provider);
  return result.user;
}

export async function signOutUser() {
  await signOut(ensureAuth());
}

export async function getIdToken(forceRefresh = false) {
  const user = ensureAuth().currentUser;
  return user ? user.getIdToken(forceRefresh) : "";
}

export function currentUser() {
  const user = ensureAuth().currentUser;
  return user ? { uid: user.uid, email: user.email || "", displayName: user.displayName || "" } : null;
}
