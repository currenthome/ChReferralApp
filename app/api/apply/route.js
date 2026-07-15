import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { phoneKey, formatPhone, DEPARTMENTS, STAGES } from "@/lib/constants";
import { getScoring, awardPoints } from "@/lib/points";
import { notifyManagers } from "@/lib/notify";

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Public endpoint — a candidate applying through a rep's link/QR. No login.
// Same duplicate rules as internal referrals: first submission wins.
// Rate-limited per IP via a Firestore counter (serverless-safe).
export async function POST(request) {
  const db = adminDb();
  const body = await request.json().catch(() => ({}));

  // Honeypot: real users never fill this hidden field.
  if (body.website) return NextResponse.json({ ok: true });

  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const rlRef = db.collection("rateLimits").doc(`${day}_${ip.replace(/[^0-9a-fA-F.:]/g, "")}`);
  const rl = await rlRef.get();
  const count = rl.exists ? rl.data().count : 0;
  if (count >= 10) return bad("Too many applications from this network today. Try again tomorrow.", 429);
  await rlRef.set({ count: count + 1, at: new Date().toISOString() });

  const code = String(body.code || "").trim().toUpperCase();
  const candidateName = String(body.candidateName || "").trim();
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

  const dupSnap = await db
    .collection("referrals")
    .where("phoneKey", "==", key)
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (!dupSnap.empty) {
    await notifyManagers(db, {
      dept,
      type: "duplicate",
      referralId: dupSnap.docs[0].id,
      candidateName,
      byName: referrer.name,
      message: `${candidateName} applied via ${referrer.name}'s link — already in the system. Worth a fresh look.`,
    });
    // The applicant just sees success; ownership rules are internal.
    return NextResponse.json({ ok: true, referrerName: referrer.name });
  }

  const now = new Date().toISOString();
  const ref = await db.collection("referrals").add({
    candidateName,
    candidatePhone: formatPhone(key),
    phoneKey: key,
    dept,
    referrerUid,
    referrerName: referrer.name,
    referrerDept: referrer.dept || "",
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
