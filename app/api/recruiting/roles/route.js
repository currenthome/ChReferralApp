import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS } from "@/lib/constants";
import { getRoles, DEFAULT_ROLES } from "@/lib/recruiting";

// Sub-roles per department. Everyone with recruiting access reads them;
// only execs change them, because the role list is shared by every
// department's classes, candidates, and scorecard forms.

export async function GET(request) {
  const { db, error } = await requireV2(request);
  if (error) return error;
  return NextResponse.json({ roles: await getRoles(db) });
}

export async function POST(request) {
  const { user, db, error } = await requireV2(request, { minLevel: "exec" });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const dept = String(body.dept || "").trim();
  if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");
  if (!Array.isArray(body.roles)) return jsonError("Send the full role list for that department.");

  const roles = body.roles
    .map((r) => String(r || "").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
  if (!roles.length) return jsonError("A department needs at least one role.");

  const current = await getRoles(db);
  await db
    .collection("config")
    .doc("roles")
    .set({ ...current, [dept]: roles }, { merge: true });

  await audit(db, user, "v2.roles.update", dept, {
    from: current[dept] || DEFAULT_ROLES[dept] || [],
    to: roles,
  });
  return NextResponse.json({ ok: true, message: `${dept} roles updated.` });
}
