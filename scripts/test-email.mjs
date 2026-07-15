// Sends a test notification email using SMTP creds from .env.local.
// Usage: node scripts/test-email.mjs recipient@currenthome.com
import { readFileSync } from "fs";
import nodemailer from "nodemailer";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const to = process.argv[2];
if (!to) {
  console.error("Usage: node scripts/test-email.mjs recipient@...");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

try {
  await transporter.sendMail({
    from: `Current Home Referrals <${env.SMTP_USER}>`,
    to,
    subject: "Referral portal test — email notifications are live",
    text: "This is the test email from the Employee Referral Portal. If you're reading this, notification emails are working.\n\n— sent automatically during setup",
  });
  console.log("SENT OK to " + to);
} catch (e) {
  console.log("FAILED: " + e.message);
  process.exit(1);
}
