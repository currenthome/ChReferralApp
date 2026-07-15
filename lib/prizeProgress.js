// Progress toward a prize, per user, measured from the prize's creation
// to its deadline. Metrics: hires, points, referrals, cash.
export async function computeProgress(db, prize, uids) {
  const since = prize.createdAt || "";
  const untilDate = prize.deadline ? `${prize.deadline}T23:59:59` : "9999";
  const totals = {};
  uids.forEach((u) => (totals[u] = 0));

  if (prize.metric === "hires" || prize.metric === "referrals") {
    const snap = await db.collection("referrals").get();
    snap.docs.forEach((d) => {
      const r = d.data();
      if (!(r.referrerUid in totals)) return;
      if (prize.metric === "referrals") {
        if (r.createdAt >= since && r.createdAt <= untilDate) totals[r.referrerUid] += 1;
      } else {
        const hiredAt = (r.timeline || []).find((t) => t.stage === "Hired")?.at;
        if (hiredAt && !r.out && hiredAt >= since && hiredAt <= untilDate) totals[r.referrerUid] += 1;
      }
    });
  } else {
    const snap = await db.collection("pointsEvents").get();
    snap.docs.forEach((d) => {
      const e = d.data();
      if (!(e.uid in totals)) return;
      if (e.at >= since && e.at <= untilDate) {
        totals[e.uid] += prize.metric === "cash" ? e.cash || 0 : e.points || 0;
      }
    });
  }
  return totals;
}
