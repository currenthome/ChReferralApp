// Adds the production domain to Firebase Auth's authorized domains so
// Google sign-in works from the live site. Run: node scripts/add-auth-domain.mjs <domain>
import { readFileSync } from "fs";
import { GoogleAuth } from "google-auth-library";

const domain = process.argv[2];
if (!domain) {
  console.error("Usage: node scripts/add-auth-domain.mjs <domain>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const raw = env.FIREBASE_SERVICE_ACCOUNT;
const creds = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));

const auth = new GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/identitytoolkit", "https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${creds.project_id}/config`;

const { data: config } = await client.request({ url: base });
const domains = config.authorizedDomains || [];
if (domains.includes(domain)) {
  console.log(`Already authorized: ${domain}\nCurrent list: ${domains.join(", ")}`);
  process.exit(0);
}

const updated = [...domains, domain];
await client.request({
  url: `${base}?updateMask=authorizedDomains`,
  method: "PATCH",
  data: { authorizedDomains: updated },
});
console.log(`Authorized domains now: ${updated.join(", ")}`);
