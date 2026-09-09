import { NextResponse } from "next/server";
import { requireV2 } from "@/lib/server";

// Who can be picked as an interviewer: anyone active with recruiting access.
// Recruiters and execs can interview for any department; a department manager
// only shows up for their own, which is the same rule that governs what they
// can see.
export async function GET(request) {
  const { db, error } = await requireV2(request);
  if (error) return error;

  const snap = await db.collection("users").get();
  const people = snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.active !== false && ["exec", "recruiter", "dept-manager"].includes(u.v2Access))
    .map((u) => ({
      uid: u.uid,
      name: u.name || u.email,
      dept: u.dept || "",
      level: u.v2Access,
      allDepts: u.v2Access !== "dept-manager",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ people });
}
