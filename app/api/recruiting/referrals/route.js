import { NextResponse } from "next/server";
import { requireV2 } from "@/lib/server";
import { STAGES, HIRED_STAGE } from "@/lib/constants";

// Referrals a recruiter can start a candidate from, so an employee's referral
// never has to be retyped. Starting from one links the two for certain, rather
// than relying on the phone numbers matching.
//
// Left out: anyone already in the recruiting pipeline, anyone a manager marked
// not moving forward, and anyone already hired — none of those need working.
export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const [refSnap, candSnap] = await Promise.all([
    db.collection("referrals").get(),
    db.collection("candidates").get(),
  ]);

  const taken = new Set(
    candSnap.docs.map((d) => d.data().referralId).filter(Boolean)
  );

  const referrals = refSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => !r.out && r.stage < HIRED_STAGE && !taken.has(r.id))
    // A department manager only starts from referrals to their own department.
    .filter((r) => v2.allDepts || r.dept === v2.scopeDept)
    .map((r) => ({
      id: r.id,
      name: r.candidateName,
      phone: r.candidatePhone,
      phoneKey: r.phoneKey,
      dept: r.dept,
      stage: STAGES[r.stage] || "",
      referrerName: r.referrerName || "",
      resumeUrl: r.resumeUrl || "",
      resumeName: r.resumeName || "",
      createdAt: r.createdAt,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ referrals });
}
