import { DEFAULT_SCORING, monthKey } from "./constants";

export async function getScoring(db) {
  const snap = await db.collection("config").doc("scoring").get();
  return snap.exists ? { ...DEFAULT_SCORING, ...snap.data() } : DEFAULT_SCORING;
}

// One ledger entry per (referral, milestone) — the "awarded" flags on the
// referral doc guarantee a milestone never pays twice. Points are never
// clawed back; termination only stops future milestones.
export async function awardPoints(db, { uid, referralId, milestone, points }) {
  await db.collection("pointsEvents").add({
    uid,
    referralId,
    milestone,
    points,
    month: monthKey(),
    at: new Date().toISOString(),
  });
}

// Aggregate a user set's points, optionally for a single month.
export async function pointsByUser(db, { month } = {}) {
  let q = db.collection("pointsEvents");
  if (month) q = q.where("month", "==", month);
  const snap = await q.get();
  const totals = {};
  snap.docs.forEach((d) => {
    const { uid, points } = d.data();
    totals[uid] = (totals[uid] || 0) + points;
  });
  return totals;
}
