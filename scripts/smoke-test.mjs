// Verifies the service account can reach Firestore: write, read, delete a test doc.
// Run: node scripts/smoke-test.mjs
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const raw = env.FIREBASE_SERVICE_ACCOUNT;
const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
const app = initializeApp({ credential: cert(JSON.parse(json)) });
const db = getFirestore(app);

const ref = db.collection("_smoke").doc("test");
await ref.set({ ok: true, at: new Date().toISOString() });
const snap = await ref.get();
await ref.delete();

console.log(
  snap.exists && snap.data().ok
    ? "PASS: Firestore write/read/delete succeeded as " + JSON.parse(json).client_email
    : "FAIL: doc round-trip did not return expected data"
);
process.exit(snap.exists ? 0 : 1);
