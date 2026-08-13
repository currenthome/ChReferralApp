import { NextResponse } from "next/server";
import { requireAdmin, jsonError, audit } from "@/lib/server";

// Start a view-as session. The client stores the target and sends an
// X-View-As header on every request after this; the read-only rule and the
// user swap are enforced in requireUser, not here. This route exists so
// every view-as session is validated and lands in the audit log.
export async function POST(request) {
  const { user, db, error } = await requireAdmin(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const uid = String(body.uid || "");
  if (!uid) return jsonError("Missing user");
  if (uid === user.uid) return jsonError("That's you.");

  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return jsonError("User not found", 404);
  const target = snap.data();

  await audit(db, user, "admin.viewAs", uid, { email: target.email, name: target.name });
  return NextResponse.json({ ok: true, uid, name: target.name, email: target.email });
}

// End a view-as session (audit only — the client clears its own state).
export async function DELETE(request) {
  const { user, db, error } = await requireAdmin(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  await audit(db, user, "admin.viewAsExit", String(body.uid || ""), { name: body.name || "" });
  return NextResponse.json({ ok: true });
}
