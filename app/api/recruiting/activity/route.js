import { NextResponse } from "next/server";
import { requireV2 } from "@/lib/server";

// The activity feed reads the same audit trail the app has always written —
// nothing new is recorded for it (decision 3A.5). Ordering on one field with a
// limit needs no extra index; the recruiting rows are picked out in memory,
// the same approach the referral screens take.
const WINDOW = 400;

export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const snap = await db.collection("auditLog").orderBy("at", "desc").limit(WINDOW).get();

  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => String(r.action || "").startsWith("v2."))
    // A department manager sees their own department's activity. Anything not
    // tied to a department is a shared-settings change, which is above them.
    .filter((r) => v2.allDepts || r.details?.dept === v2.scopeDept)
    .map((r) => ({
      id: r.id,
      action: r.action,
      actorName: r.actorName,
      target: r.target,
      details: r.details || {},
      at: r.at,
    }));

  return NextResponse.json({ rows, scopeDept: v2.scopeDept });
}
