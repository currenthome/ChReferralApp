import { NextResponse } from "next/server";
import { requireUser, jsonError, audit } from "@/lib/server";
import { phoneKey, formatPhone, DEPARTMENTS, STAGES } from "@/lib/constants";
import { getScoring, awardPoints } from "@/lib/points";
import { notifyManagers } from "@/lib/notify";

// Submit a referral. Duplicates match on the normalized phone number;
// the first submission wins all credit (no points for later ones, but
// managers are re-notified so the candidate never falls through a crack).
export async function POST(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const candidateName = String(body.candidateName || "").trim();
  const key = phoneKey(body.candidatePhone);
  const dept = String(body.dept || "").trim();

  if (candidateName.length < 2) return jsonError("Enter the person's name.");
  if (key.length !== 10) return jsonError("Enter a valid 10-digit mobile number.");
  if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");

  const dupSnap = await db
    .collection("referrals")
    .where("phoneKey", "==", key)
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (!dupSnap.empty) {
    const first = dupSnap.docs[0].data();
    await notifyManagers(db, {
      dept,
      type: "duplicate",
      referralId: dupSnap.docs[0].id,
      candidateName,
      byName: user.name,
      message: `${user.name} re-submitted ${candidateName} — already referred by ${first.referrerName}. Worth a fresh look.`,
    });
    return NextResponse.json({
      duplicate: true,
      message: "This person was already referred. The team has been re-notified — no new points, but thanks for flagging them again.",
    });
  }

  const now = new Date().toISOString();
  const ref = await db.collection("referrals").add({
    candidateName,
    candidatePhone: formatPhone(key),
    phoneKey: key,
    dept,
    referrerUid: user.uid,
    referrerName: user.name,
    referrerDept: user.dept || "",
    stage: 0,
    out: false,
    lead: "recruiting", // new referrals default to recruiting-first contact
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
    uid: user.uid,
    referralId: ref.id,
    milestone: "submit",
    points: scoring.submit.pts,
  });

  await audit(db, user, "referral.submit", ref.id, { candidateName, dept });
  await notifyManagers(db, {
    dept,
    type: "new",
    referralId: ref.id,
    candidateName,
    byName: user.name,
    message: `New referral: ${candidateName} for ${dept}, referred by ${user.name}. Reach out fast.`,
  });

  return NextResponse.json({ ok: true, id: ref.id, points: scoring.submit.pts });
}

// My referrals.
export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const snap = await db
    .collection("referrals")
    .where("referrerUid", "==", user.uid)
    .get();

  const pointsSnap = await db
    .collection("pointsEvents")
    .where("uid", "==", user.uid)
    .get();

  const pointsByReferral = {};
  let totalPoints = 0;
  pointsSnap.docs.forEach((d) => {
    const { referralId, points } = d.data();
    pointsByReferral[referralId] = (pointsByReferral[referralId] || 0) + points;
    totalPoints += points;
  });

  const referrals = snap.docs
    .map((d) => {
      const r = d.data();
      return {
        id: d.id,
        candidateName: r.candidateName,
        candidatePhone: r.candidatePhone,
        dept: r.dept,
        stage: r.stage,
        out: r.out,
        createdAt: r.createdAt,
        timeline: r.timeline || [],
        points: pointsByReferral[d.id] || 0,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ referrals, totalPoints });
}
