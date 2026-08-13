"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
} from "firebase/auth";

// Client config is public by design — security comes from server-side checks
// and locked Firestore rules, not from hiding these values.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function clientAuth() {
  return getAuth(firebaseApp());
}

export async function signInWithGoogle() {
  const auth = clientAuth();
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  // Hint Google to only offer currenthome.com accounts; the server enforces it.
  provider.setCustomParameters({ hd: "currenthome.com" });
  return signInWithPopup(auth, provider);
}

// Active view-as session (admins only) — { uid, name } or null.
export function getViewAs() {
  try {
    return JSON.parse(sessionStorage.getItem("viewAs") || "null");
  } catch {
    return null;
  }
}

// Firebase restores the session asynchronously after a fresh page load.
// Wait for that to settle before fetching — otherwise the first request on a
// direct link goes out unauthenticated, 401s, and the page renders empty.
function authReady() {
  const auth = clientAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
}

// All data flows through our API with the caller's ID token attached.
// During view-as, the X-View-As header makes the server answer as that user.
export async function api(path, { method = "GET", body } = {}) {
  const user = await authReady();
  const token = user ? await user.getIdToken() : null;
  const viewAs = getViewAs();
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(viewAs ? { "X-View-As": viewAs.uid } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
