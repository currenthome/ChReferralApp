import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";
import { HIRED_STAGE, monthKey, COMPANY_TZ } from "@/lib/constants";

function rangeBounds(range, fromParam, toParam) {
  if (range === "ytd") {
    const year = monthKey().slice(0, 4);
    return { from: `${year}-01-01`, to: "9999" };
  }
  if (range === "custom") {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam || "") ? fromParam : "0000";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam || "") ? `${toParam}T23:59:59` : "9999";
    return { from, to };
  }
  return null; // month (handled via month field) or all
}

// Leaderboard: ranked by points; ties break by hires, then earliest to reach
// the score. Referral/hire stats follow the selected range.
export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "month"; // month | ytd | all | custom
  const scope = url.searchParams.get("scope") || "dept"; // dept | company
  const bounds = rangeBounds(range, url.searchParams.get("from"), url.searchParams.get("to"));

  let q = db.collection("pointsEvents");
  if (range === "month") q = q.where("month", "==", monthKey());
  const eventsSnap = await q.get();

  const totals = {};
  const lastAt = {};
  eventsSnap.docs.forEach((d) => {
    const { uid, points, at } = d.data();
    if (bounds && (at < bounds.from || at > bounds.to)) return;
    totals[uid] = (totals[uid] || 0) + points;
    if (!lastAt[uid] || at > lastAt[uid]) lastAt[uid] = at;
  });

  const usersSnap = await db.collection("users").where("active", "==", true).get();
  const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  const inRange = (at) => {
    if (!at) return false;
    if (range === "all") return true;
    if (range === "month") return at.slice(0, 7) === monthKey();
    return at >= bounds.from && at <= bounds.to;
  };

  const referralsSnap = await db.collection("referrals").get();
  const refStats = {};
  referralsSnap.docs.forEach((d) => {
    const r = d.data();
    const s = (refStats[r.referrerUid] = refStats[r.referrerUid] || { refs: 0, hires: 0 });
    if (inRange(r.createdAt)) s.refs += 1;
    const hiredAt = (r.timeline || []).find((t) => t.stage === "Hired")?.at;
    if (r.stage === HIRED_STAGE && !r.out && inRange(hiredAt)) s.hires += 1;
  });

  let rows = users.map((u) => ({
    uid: u.uid,
    name: u.name,
    dept: u.dept,
    points: totals[u.uid] || 0,
    refs: refStats[u.uid]?.refs || 0,
    hires: refStats[u.uid]?.hires || 0,
    lastAt: lastAt[u.uid] || "",
  }));

  if (scope === "dept" && user.dept) rows = rows.filter((r) => r.dept === user.dept);

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.hires - a.hires ||
      (a.lastAt < b.lastAt ? -1 : a.lastAt > b.lastAt ? 1 : 0)
  );

  // Active prize banner for this scope (soonest deadline first).
  const today = new Date().toISOString().slice(0, 10);
  const prizesSnap = await db.collection("prizes").get();
  const banner = prizesSnap.docs
    .map((d) => d.data())
    .filter((p) => p.deadline >= today)
    .filter((p) => (scope === "dept" ? p.dept === user.dept || p.dept === "Company-wide" : p.dept === "Company-wide"))
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))[0] || null;

  return NextResponse.json({
    rows: rows.map(({ lastAt, ...r }, i) => ({ ...r, rank: i + 1, you: r.uid === user.uid })),
    scope: scope === "dept" ? user.dept || "Company" : "Company",
    range,
    banner: banner && {
      reward: banner.reward,
      type: banner.type,
      dept: banner.dept,
      deadline: banner.deadline,
      metric: banner.metric,
      target: banner.target,
      by: banner.createdByName,
    },
  });
}
