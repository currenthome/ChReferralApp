import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";
import { computeProgress } from "@/lib/prizeProgress";

// Active prizes visible to the caller (their department + company-wide),
// with live progress: Target → my progress toward the goal; Race → my rank
// and the current leader.
export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const today = new Date().toISOString().slice(0, 10);
  const snap = await db.collection("prizes").get();
  const prizes = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => (p.dept === "Company-wide" || p.dept === user.dept) && p.deadline >= today)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));

  const usersSnap = await db.collection("users").where("active", "==", true).get();
  const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  const out = [];
  for (const p of prizes) {
    const scopeUsers = p.dept === "Company-wide" ? allUsers : allUsers.filter((u) => u.dept === p.dept);
    const totals = await computeProgress(db, p, scopeUsers.map((u) => u.uid));
    const mine = totals[user.uid] || 0;

    if (p.type === "Target") {
      out.push({ ...p, mine, earned: mine >= p.target });
    } else {
      const ranked = scopeUsers
        .map((u) => ({ uid: u.uid, name: u.name, value: totals[u.uid] || 0 }))
        .sort((a, b) => b.value - a.value);
      const myRank = ranked.findIndex((r) => r.uid === user.uid) + 1;
      out.push({
        ...p,
        mine,
        leaderName: ranked[0]?.value > 0 ? ranked[0].name : null,
        leaderValue: ranked[0]?.value || 0,
        myRank: myRank || null,
        leading: myRank === 1 && mine > 0,
      });
    }
  }

  return NextResponse.json({ prizes: out });
}
