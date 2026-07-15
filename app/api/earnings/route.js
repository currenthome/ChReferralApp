import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";
import { getScoring } from "@/lib/points";
import { HIRED_STAGE } from "@/lib/constants";

const MILESTONES = ["submit", "start", "day30"];

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
    earnedByRef[e.referralId][e.milestone] = e.cash;
  });

  let earned = 0;
  let pipeline = 0;
  const referrals = [];

  for (const doc of refsSnap.docs) {
    const r = doc.data();
    const got = earnedByRef[doc.id] || {};
    const dead = r.out || !!r.terminationDate;

    const payouts = MILESTONES.map((m) => {
      if (got[m]) {
        earned += got[m];
        return { milestone: m, label: scoring[m].label, cash: got[m], state: "earned" };
      }
      const amount = scoring[m].cash || 0;
      if (dead) return { milestone: m, label: scoring[m].label, cash: amount, state: "void" };
      pipeline += amount;
      return { milestone: m, label: scoring[m].label, cash: amount, state: "pending" };
    }).filter((p) => p.cash > 0);

    referrals.push({
      id: doc.id,
      candidateName: r.candidateName,
      dept: r.dept,
      stage: r.stage,
      out: r.out,
      hired: r.stage === HIRED_STAGE && !r.out,
      terminated: !!r.terminationDate,
      createdAt: r.createdAt,
      payouts,
    });
  }

  referrals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ earned, pipeline, referrals });
}
