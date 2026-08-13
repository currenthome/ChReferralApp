import { NextResponse } from "next/server";
import { requireManager } from "@/lib/server";

// All referrals for manager screens. A referral is always visible to its
// referrer's department, wherever the candidate went; the candidate's own
// department is who works it. Recruiting-department managers see everything.
// scope=company returns the whole pipeline (recruiting oversight view).
export async function GET(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const [snap, usersSnap, pointsSnap] = await Promise.all([
    db.collection("referrals").get(),
    db.collection("users").get(),
    db.collection("pointsEvents").get(),
  ]);
  const seesAll = user.dept === "Recruiting" || scope === "company";

  // Referrer's *current* department — the snapshot stored on the referral can
  // be blank or stale (people set or change departments after submitting).
  const deptByUid = {};
  usersSnap.docs.forEach((d) => (deptByUid[d.id] = d.data().dept || ""));

  const pointsByReferral = {};
  pointsSnap.docs.forEach((d) => {
    const { referralId, points } = d.data();
    pointsByReferral[referralId] = (pointsByReferral[referralId] || 0) + points;
  });

  const referrals = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .map((r) => ({
      ...r,
      points: pointsByReferral[r.id] || 0,
      // Seeing and working are different rights: the candidate's department
      // moves them through the funnel; everyone connected still sees them.
      canWork: seesAll || r.dept === user.dept,
    }))
    .filter(
      (r) =>
        seesAll ||
        r.dept === user.dept ||
        r.referrerUid === user.uid ||
        (!!user.dept && deptByUid[r.referrerUid] === user.dept)
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ referrals, seesAll: user.dept === "Recruiting" });
}
