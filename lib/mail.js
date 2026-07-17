import nodemailer from "nodemailer";

// Email goes out through the company's own Gmail (SMTP_USER + app password).
// Until those env vars are set, sends are skipped quietly — the app still works.
export async function sendMail({ to, subject, text }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass || !to?.length) return { skipped: true };

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    // Single recipient gets a normal To: header; groups stay bcc for privacy.
    const list = Array.isArray(to) ? to : [to];
    await transporter.sendMail({
      from: process.env.NOTIFY_FROM || `Current Home Referrals <${user}>`,
      ...(list.length === 1 ? { to: list[0] } : { bcc: list.join(",") }),
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.error("Email send failed:", err.message);
    return { error: err.message };
  }
}
