import { NextResponse } from "next/server";
import { requireManager } from "@/lib/server";
import { STAGES, HIRED_STAGE } from "@/lib/constants";

// Campaign reporting: funnel, conversions, hires, rep quality.
// Any manager can view any department or company-wide. A department's report
// covers every referral connected to it: candidates for its jobs AND
// referrals its own people made, wherever the candidate went.
export async function GET(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days")) || 0; // 0 = all time
  const dept = url.searchParams.get("dept") || "Company";

  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : "";

  const [snap, usersSnap] = await Promise.all([
    db.collection("referrals").get(),
    db.collection("users").get(),
  ]);

  // Match on the referrer's *current* department — the snapshot stored on
  // the referral can be blank or stale.
  const deptByUid = {};
  usersSnap.docs.forEach((d) => (deptByUid[d.id] = d.data().dept || ""));

  const referrals = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.createdAt >= since)
    .filter((r) => dept === "Company" || r.dept === dept || deptByUid[r.referrerUid] === dept);

  // Funnel: how many referrals reached each stage (cumulative).
  const funnel = STAGES.map((label, i) => ({
    label,
    count: referrals.filter((r) => r.stage >= i).length,
  }));

  const submitted = referrals.length;
  const hires = referrals.filter((r) => r.stage === HIRED_STAGE && !r.out).length;
  const out = referrals.filter((r) => r.out).length;
  const selfApplied = referrals.filter((r) => r.source === "self-apply").length;

  const conversions = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    const from = funnel[i].count;
    const to = funnel[i + 1].count;
    conversions.push({
      label: `${STAGES[i]} → ${STAGES[i + 1]}`,
      pct: from ? Math.round((to / from) * 100) : 0,
    });
  }

  // Rep quality: volume vs winners.
  const byRep = {};
  referrals.forEach((r) => {
    const s = (byRep[r.referrerUid] = byRep[r.referrerUid] || { name: r.referrerName, refs: 0, hires: 0, active: 0 });
    s.refs += 1;
    if (r.stage === HIRED_STAGE && !r.out) s.hires += 1;
    if (!r.out && r.stage < HIRED_STAGE) s.active += 1;
  });
  const reps = Object.values(byRep)
    .map((s) => ({ ...s, conversion: s.refs ? Math.round((s.hires / s.refs) * 100) : 0 }))
    .sort((a, b) => b.hires - a.hires || b.refs - a.refs);

  return NextResponse.json({
    dept,
    days,
    headline: {
      submitted,
      hires,
      conversion: submitted ? Math.round((hires / submitted) * 100) : 0,
      inPipeline: submitted - hires - out,
      selfApplied,
    },
    funnel,
    conversions,
    reps,
  });
}
