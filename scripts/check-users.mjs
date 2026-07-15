// Quick admin check: list provisioned users and their roles.
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
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(json)) }));

const users = await db.collection("users").get();
users.docs.forEach((d) => {
  const u = d.data();
  console.log(`${u.name} <${u.email}> — role: ${u.role}, dept: ${u.dept || "(none)"}, active: ${u.active}`);
});
console.log(`Total users: ${users.size}`);
