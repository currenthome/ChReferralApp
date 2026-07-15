import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { adminDb } from "@/lib/firebaseAdmin";
import { phoneKey, formatPhone, DEPARTMENTS, STAGES } from "@/lib/constants";
import { getScoring, awardPoints } from "@/lib/points";
import { notifyManagers } from "@/lib/notify";

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const RESUME_TYPES = [".pdf", ".doc", ".docx"];
const RESUME_MAX_BYTES = 4 * 1024 * 1024;

// Public endpoint — a candidate applying through a rep's link/QR. No login.
// Accepts multipart form data with an optional resume file.
// Same duplicate rules as internal referrals: first submission wins.
// Rate-limited per IP via a Firestore counter (serverless-safe).
export async function POST(request) {
  const db = adminDb();
  let body = {};
  let resumeFile = null;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return bad("Bad request");
    body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    const f = form.get("resume");
    if (f && typeof f !== "string" && f.size > 0) resumeFile = f;
  } else {
    body = await request.json().catch(() => ({}));
  }

  // Honeypot: real users never fill this hidden field.
  if (body.website) return NextResponse.json({ ok: true });

  // x-real-ip is set by Vercel's edge and can't be spoofed by the client.
  const ip = request.headers.get("x-real-ip") || (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const rlRef = db.collection("rateLimits").doc(`${day}_${ip.replace(/[^0-9a-fA-F.:]/g, "")}`);
  const rl = await rlRef.get();
  const count = rl.exists ? rl.data().count : 0;
  if (count >= 10) return bad("Too many applications from this network today. Try again tomorrow.", 429);
  await rlRef.set({ count: count + 1, at: new Date().toISOString() });

  const code = String(body.code || "").trim().toUpperCase().slice(0, 32);
  const candidateName = String(body.candidateName || "").trim().slice(0, 100);
  const key = phoneKey(body.candidatePhone);
  const dept = String(body.dept || "").trim();

  if (!code) return bad("Missing referral code.");
  if (candidateName.length < 2) return bad("Enter your name.");
  if (key.length !== 10) return bad("Enter a valid 10-digit mobile number.");
  if (!DEPARTMENTS.includes(dept)) return bad("Pick a team.");

  const codeSnap = await db.collection("shareCodes").doc(code).get();
  if (!codeSnap.exists) return bad("This referral link is not valid.", 404);
  const referrerUid = codeSnap.data().uid;
  const referrerSnap = await db.collection("users").doc(referrerUid).get();
  if (!referrerSnap.exists || referrerSnap.data().active === false) {
    return bad("This referral link is no longer active.", 404);
  }
  const referrer = referrerSnap.data();

  // No orderBy — avoids needing a composite index; sort in memory instead.
  const dupSnap = await db.collection("referrals").where("phoneKey", "==", key).get();

  if (!dupSnap.empty) {
    const firstDoc = dupSnap.docs.sort((a, b) =>
      a.data().createdAt < b.data().createdAt ? -1 : 1
    )[0];
    await notifyManagers(db, {
      dept,
      type: "duplicate",
      referralId: firstDoc.id,
      candidateName,
      byName: referrer.name,
      message: `${candidateName} applied via ${referrer.name}'s link — already in the system. Worth a fresh look.`,
    });
    // The applicant just sees success; ownership rules are internal.
    return NextResponse.json({ ok: true, referrerName: referrer.name });
  }

  // Optional resume → private-ish storage (unguessable URL), linked on the referral.
  let resumeUrl = "";
  let resumeName = "";
  if (resumeFile) {
    const lower = (resumeFile.name || "resume").toLowerCase();
    if (!RESUME_TYPES.some((ext) => lower.endsWith(ext))) {
      return bad("Resume must be a PDF or Word document.");
    }
    if (resumeFile.size > RESUME_MAX_BYTES) {
      return bad("Resume must be under 4 MB.");
    }
    try {
      const blob = await put(`resumes/${lower.replace(/[^a-z0-9._-]/g, "_")}`, resumeFile, {
        access: "public",
        addRandomSuffix: true,
      });
      resumeUrl = blob.url;
      resumeName = resumeFile.name;
    } catch (err) {
      console.error("Resume upload failed:", err.message);
      // Application still goes through — the resume is optional.
    }
  }

  const now = new Date().toISOString();
  const ref = await db.collection("referrals").add({
    candidateName,
    candidatePhone: formatPhone(key),
    phoneKey: key,
    dept,
    resumeUrl,
    resumeName,
    referrerUid,
    referrerName: referrer.name,
    referrerDept: referrer.dept || "",
    referrerPhone: referrer.phone || "",
    source: "self-apply",
    stage: 0,
    out: false,
    lead: "recruiting",
    startDate: null,
    terminationDate: null,
    startAwarded: false,
    day30Awarded: false,
    createdAt: now,
    stageChangedAt: now,
    timeline: [{ stage: STAGES[0], at: now }],
  });

  const scoring = await getScoring(db);
  await awardPoints(db, {
    uid: referrerUid,
    referralId: ref.id,
    milestone: "submit",
    points: scoring.submit.pts,
    cash: scoring.submit.cash || 0,
  });

  await db.collection("auditLog").add({
    actorUid: "public",
    actorName: candidateName,
    action: "referral.selfApply",
    target: ref.id,
    details: { dept, viaCode: code, referrer: referrer.name },
    at: now,
  });

  await notifyManagers(db, {
    dept,
    type: "new",
    referralId: ref.id,
    candidateName,
    byName: referrer.name,
    message: `${candidateName} self-applied for ${dept} through ${referrer.name}'s link. Reach out fast.`,
  });

  return NextResponse.json({ ok: true, referrerName: referrer.name });
}

// Public: look up whose link this is, so the page can greet the applicant.
export async function GET(request) {
  const db = adminDb();
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) return bad("Missing code");
  const snap = await db.collection("shareCodes").doc(code).get();
  if (!snap.exists) return bad("Invalid code", 404);
  return NextResponse.json({ referrerName: snap.data().name });
}
