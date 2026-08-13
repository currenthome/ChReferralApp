import { NextResponse } from "next/server";
import { requireUser, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS, phoneKey, formatPhone } from "@/lib/constants";

export async function GET(request) {
  const { user, error, viewingAs } = await requireUser(request);
  if (error) return error;
  return NextResponse.json({
    uid: user.uid,
    email: user.email,
    name: user.name,
    dept: user.dept,
    role: user.role,
    phone: user.phone || "",
    viewingAs: !!viewingAs,
  });
}

// Self-service profile completion: a user may set their department once
// (when it's empty) and keep their own phone up to date. Department
// changes after that go through a manager in People.
export async function POST(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const update = {};

  if (body.dept !== undefined) {
    if (user.dept) return jsonError("Your department is set — ask a manager to change it.");
    if (!DEPARTMENTS.includes(body.dept)) return jsonError("Pick a department.");
    update.dept = body.dept;
  }
  if (body.phone !== undefined) {
    const key = phoneKey(body.phone);
    if (body.phone && key.length !== 10) return jsonError("Enter a valid 10-digit mobile number.");
    update.phone = body.phone ? formatPhone(key) : "";
  }
  if (!Object.keys(update).length) return jsonError("Nothing to update.");

  await db.collection("users").doc(user.uid).update(update);
  await audit(db, user, "profile.update", user.uid, update);
  return NextResponse.json({ ok: true });
}
