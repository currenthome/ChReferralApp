import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";
import { getScoring } from "@/lib/points";
import { HIRED_STAGE } from "@/lib/constants";


// Earned = cash actually awarded (from the ledger; never clawed back).
// Pipeline = future payouts at current rates if the referral gets hired
// and sticks. Out/terminated referrals show voided payouts.
export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const [refsSnap, eventsSnap, scoring] = await Promise.all([
    db.collection("referrals").where("referrerUid", "==", user.uid).get(),
    db.collection("pointsEvents").where("uid", "==", user.uid).get(),
    getScoring(db),
  ]);

  const earnedByRef = {};
  eventsSnap.docs.forEach((d) => {
    const e = d.data();
    if (!e.cash) return;
    earnedByRef[e.referralId] = earnedByRef[e.referralId] || {};
    earnedByRef[e.referralId][e.milestone] = { cash: e.cash, label: e.label };
  });

  // Base milestones plus manager-added retention milestones.
  const milestones = [
    { key: "submit", label: scoring.submit.label, cash: scoring.submit.cash || 0 },
    { key: "start", label: scoring.start.label, cash: scoring.start.cash || 0 },
    { key: "day30", label: scoring.day30.label, cash: scoring.day30.cash || 0 },
    ...(scoring.custom || []).map((m) => ({ key: m.id, label: m.name, cash: m.cash || 0 })),
  ];

  let earned = 0;
  let pipeline = 0;
  const referrals = [];

  for (const doc of refsSnap.docs) {
    const r = doc.data();
    const got = earnedByRef[doc.id] || {};
    const dead = r.out || !!r.terminationDate;

    const payouts = milestones.map((m) => {
      if (got[m.key]) {
        earned += got[m.key].cash;
        return { milestone: m.key, label: m.label, cash: got[m.key].cash, state: "earned" };
      }
      if (dead) return { milestone: m.key, label: m.label, cash: m.cash, state: "void" };
      pipeline += m.cash;
      return { milestone: m.key, label: m.label, cash: m.cash, state: "pending" };
    });
    // Cash earned on milestones later removed from config still counts.
    for (const [key, g] of Object.entries(got)) {
      if (!milestones.some((m) => m.key === key)) {
        earned += g.cash;
        payouts.push({ milestone: key, label: g.label || "Milestone", cash: g.cash, state: "earned" });
      }
    }
    const visible = payouts.filter((p) => p.cash > 0);

    referrals.push({
      id: doc.id,
      candidateName: r.candidateName,
      dept: r.dept,
      stage: r.stage,
      out: r.out,
      hired: r.stage === HIRED_STAGE && !r.out,
      terminated: !!r.terminationDate,
      createdAt: r.createdAt,
      payouts: visible,
    });
  }

  referrals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ earned, pipeline, referrals });
}
