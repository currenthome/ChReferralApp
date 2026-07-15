import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// The service account key lives ONLY in the FIREBASE_SERVICE_ACCOUNT env var
// (Vercel project settings / .env.local). Never in code, never in the repo.
function getApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

export function adminDb() {
  return getFirestore(getApp());
}

export function adminAuth() {
  return getAuth(getApp());
}
