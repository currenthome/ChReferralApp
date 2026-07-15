// End-to-end QA of the self-apply flow with resume upload, then full cleanup.
// Usage: node scripts/qa-apply.mjs setup | verify | cleanup
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

const CODE = "QATESTCODE";
const mode = process.argv[2];

if (mode === "setup") {
  const users = await db.collection("users").limit(1).get();
  const u = users.docs[0];
  await db.collection("shareCodes").doc(CODE).set({ uid: u.id, name: u.data().name, qa: true });
  console.log(`setup ok — code ${CODE} → ${u.data().name}`);
} else if (mode === "verify") {
  const snap = await db.collection("referrals").where("phoneKey", "==", "5305551234").get();
  if (snap.empty) {
    console.log("VERIFY FAIL: no referral found");
    process.exit(1);
  }
  const r = snap.docs[0].data();
  console.log(`referral created: ${r.candidateName} (${r.dept}) via ${r.referrerName}`);
  console.log(`resumeUrl: ${r.resumeUrl ? "SET — " + r.resumeUrl : "MISSING"}`);
  console.log(`resumeName: ${r.resumeName || "(none)"}`);
  process.exit(r.resumeUrl ? 0 : 1);
} else if (mode === "cleanup") {
  let deleted = 0;
  const refs = await db.collection("referrals").where("phoneKey", "==", "5305551234").get();
  for (const d of refs.docs) {
    const events = await db.collection("pointsEvents").where("referralId", "==", d.id).get();
    for (const e of events.docs) { await e.ref.delete(); deleted++; }
    const notifs = await db.collection("notifications").where("referralId", "==", d.id).get();
    for (const n of notifs.docs) { await n.ref.delete(); deleted++; }
    if (refs.docs[0].data().resumeUrl) console.log("BLOB_TO_DELETE:" + refs.docs[0].data().resumeUrl);
    await d.ref.delete(); deleted++;
  }
  await db.collection("shareCodes").doc(CODE).delete(); deleted++;
  const audits = await db.collection("auditLog").where("action", "==", "referral.selfApply").get();
  for (const a of audits.docs) {
    if (a.data().details?.viaCode === CODE) { await a.ref.delete(); deleted++; }
  }
  const today = new Date().toISOString().slice(0, 10);
  const rl = await db.collection("rateLimits").get();
  for (const r of rl.docs) { if (r.id.startsWith(today)) { await r.ref.delete(); deleted++; } }
  console.log(`cleanup ok — ${deleted} docs removed`);
}
