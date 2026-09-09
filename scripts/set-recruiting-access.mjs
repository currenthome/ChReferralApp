// Grant or remove recruiting access on a user record.
// Usage: node scripts/set-recruiting-access.mjs <email> <exec|recruiter|dept-manager|none>
//
// Recruiting access is separate from the referral-side role, so this never
// touches users.role. Every change is written to the audit log.
import { readFileSync } from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const raw = env.FIREBASE_SERVICE_ACCOUNT;
const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(json)) });
const db = getFirestore(app);

const LEVELS = ["exec", "recruiter", "dept-manager", "none"];
const email = String(process.argv[2] || "").toLowerCase().trim();
const level = String(process.argv[3] || "").trim();

if (!email || !LEVELS.includes(level)) {
  console.error("Usage: node scripts/set-recruiting-access.mjs <email> <exec|recruiter|dept-manager|none>");
  process.exit(1);
}

const snap = await db.collection("users").where("email", "==", email).get();
if (snap.empty) {
  console.error(`No user record for ${email}. They need to sign in to the app once first.`);
  process.exit(1);
}
if (snap.size > 1) {
  console.error(`${snap.size} records share that email — sort that out before setting access.`);
  process.exit(1);
}

const doc = snap.docs[0];
const before = doc.data().v2Access ?? "(unset)";
const value = level === "none" ? "" : level;

// A dept-manager with no department set can see nothing, by design — say so
// rather than leaving someone wondering why their screens are empty.
if (value === "dept-manager" && !doc.data().dept) {
  console.error(`${email} has no department set, so dept-manager access would show them nothing. Set their department first.`);
  process.exit(1);
}

await doc.ref.update({ v2Access: value });
await db.collection("auditLog").add({
  actorUid: "script",
  actorName: "set-recruiting-access script",
  action: "v2.access.set",
  target: doc.id,
  details: { email, from: before, to: value || "(none)" },
  at: new Date().toISOString(),
});

console.log(`${doc.data().name} <${email}> — recruiting access: ${before} → ${value || "(none)"}`);
process.exit(0);
