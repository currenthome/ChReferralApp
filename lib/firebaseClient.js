"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
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

// All data flows through our API with the caller's ID token attached.
export async function api(path, { method = "GET", body } = {}) {
  const user = clientAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
