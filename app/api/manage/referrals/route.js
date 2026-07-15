import { NextResponse } from "next/server";
import { requireManager } from "@/lib/server";

// All referrals for manager screens. Default scope: own department plus
// anything they referred; Recruiting-department managers see everything.
// scope=company returns the whole pipeline (recruiting oversight view).
export async function GET(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const snap = await db.collection("referrals").get();
  const seesAll = user.dept === "Recruiting" || scope === "company";

  const referrals = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => seesAll || r.dept === user.dept || r.referrerUid === user.uid)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ referrals, seesAll: user.dept === "Recruiting" });
}
