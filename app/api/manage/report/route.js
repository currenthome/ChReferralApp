import { NextResponse } from "next/server";
import { requireManager } from "@/lib/server";
import { STAGES, HIRED_STAGE } from "@/lib/constants";

// Campaign reporting: funnel, conversions, hires, rep quality.
// Any manager can view any department or company-wide. Two views:
//   hiring — candidates referred INTO the department (default)
//   team   — referrals submitted BY the department's people, wherever they went
export async function GET(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days")) || 0; // 0 = all time
  const dept = url.searchParams.get("dept") || "Company";
  const view = url.searchParams.get("view") === "team" ? "team" : "hiring";

  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : "";

  const [snap, usersSnap] = await Promise.all([
    db.collection("referrals").get(),
    db.collection("users").get(),
  ]);

  // Team view keys off the referrer's *current* department — the snapshot
  // stored on the referral can be blank or stale.
  const deptByUid = {};
  usersSnap.docs.forEach((d) => (deptByUid[d.id] = d.data().dept || ""));

  const referrals = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.createdAt >= since)
    .filter((r) => {
      if (dept === "Company") return true;
      if (view === "team") return deptByUid[r.referrerUid] === dept;
      return r.dept === dept;
    });

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
    view,
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
