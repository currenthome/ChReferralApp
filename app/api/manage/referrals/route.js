import { NextResponse } from "next/server";
import { requireManager } from "@/lib/server";

// All referrals for manager screens. Managers see their own department plus
// anything they referred; Recruiting-department managers see everything.
export async function GET(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const snap = await db.collection("referrals").get();
  const seesAll = user.dept === "Recruiting";

  const referrals = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => seesAll || r.dept === user.dept || r.referrerUid === user.uid)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ referrals, seesAll });
}
