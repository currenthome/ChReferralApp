import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";
import { HIRED_STAGE, monthKey } from "@/lib/constants";

// Leaderboard: ranked by points; ties break by hires, then earliest to reach
// the score (approximated by earliest last-event time at that score).
export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "month"; // month | all
  const scope = url.searchParams.get("scope") || "dept"; // dept | company

  let q = db.collection("pointsEvents");
  if (range === "month") q = q.where("month", "==", monthKey());
  const eventsSnap = await q.get();

  const totals = {};
  const lastAt = {};
  eventsSnap.docs.forEach((d) => {
    const { uid, points, at } = d.data();
    totals[uid] = (totals[uid] || 0) + points;
    if (!lastAt[uid] || at > lastAt[uid]) lastAt[uid] = at;
  });

  const usersSnap = await db.collection("users").where("active", "==", true).get();
  const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  const referralsSnap = await db.collection("referrals").get();
  const refStats = {};
  referralsSnap.docs.forEach((d) => {
    const r = d.data();
    const s = (refStats[r.referrerUid] = refStats[r.referrerUid] || { refs: 0, hires: 0 });
    s.refs += 1;
    if (r.stage === HIRED_STAGE && !r.out) s.hires += 1;
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

  return NextResponse.json({
    rows: rows.map(({ lastAt, ...r }, i) => ({ ...r, rank: i + 1, you: r.uid === user.uid })),
    scope: scope === "dept" ? user.dept || "Company" : "Company",
    range,
  });
}
