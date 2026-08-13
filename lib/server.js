import { NextResponse } from "next/server";
import { adminDb } from "./firebaseAdmin";
import { verifyFirebaseToken } from "./verifyToken";

const ALLOWED_DOMAIN = "currenthome.com";

// Emails that are always managers — bootstrap so the first login isn't locked out.
function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Verifies the caller's Firebase ID token, enforces the company domain,
// and loads (or auto-provisions) their user profile. Every API route calls this.
export async function requireUser(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { error: jsonError("Not signed in", 401) };

  let decoded;
  try {
    decoded = await verifyFirebaseToken(token);
  } catch {
    return { error: jsonError("Invalid or expired session", 401) };
  }

  const email = (decoded.email || "").toLowerCase();
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
    return { error: jsonError("Use your Current Home Google account", 403) };
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(decoded.uid);
  let snap = await userRef.get();

  if (!snap.exists) {
    // First login: apply a pre-assigned invite if one exists for this email,
    // otherwise default to employee. ADMIN_EMAILS always get manager.
    const inviteSnap = await db.collection("invites").doc(email).get();
    const invite = inviteSnap.exists ? inviteSnap.data() : null;
    const profile = {
      email,
      name: decoded.name || email.split("@")[0],
      photoURL: decoded.picture || "",
      dept: invite?.dept || "",
      phone: invite?.phone || "",
      role: adminEmails().includes(email) ? "manager" : invite?.role || "employee",
      active: true,
      createdAt: new Date().toISOString(),
    };
    await userRef.set(profile);
    if (inviteSnap.exists) await inviteSnap.ref.delete();
    snap = await userRef.get();
  }

  const user = { uid: decoded.uid, ...snap.data() };
  if (adminEmails().includes(email) && user.role !== "manager" && user.role !== "admin") {
    user.role = "manager";
    await userRef.update({ role: "manager" });
  }
  if (user.active === false) return { error: jsonError("Account is deactivated", 403) };

  // View-as: an admin can browse the app as another user, strictly read-only.
  // The swap happens here so every route sees exactly what the target sees.
  const viewAsUid = request.headers.get("x-view-as") || "";
  if (viewAsUid && viewAsUid !== user.uid) {
    if (user.role !== "admin") {
      return { error: jsonError("View-as requires admin access", 403) };
    }
    if (request.method !== "GET") {
      return { error: jsonError("View-as is read-only — exit view-as to make changes.", 403) };
    }
    const targetSnap = await db.collection("users").doc(viewAsUid).get();
    if (!targetSnap.exists) return { error: jsonError("That user no longer exists", 404) };
    return { user: { uid: viewAsUid, ...targetSnap.data() }, db, viewingAs: true, realUser: user };
  }

  return { user, db };
}

export async function requireManager(request) {
  const result = await requireUser(request);
  if (result.error) return result;
  if (result.user.role !== "manager" && result.user.role !== "admin") {
    return { error: jsonError("Manager access required", 403) };
  }
  return result;
}

export async function requireAdmin(request) {
  const result = await requireUser(request);
  if (result.error) return result;
  if (result.user.role !== "admin") {
    return { error: jsonError("Admin access required", 403) };
  }
  return result;
}

// Immutable audit trail: every stage change, role change, and config change lands here.
export async function audit(db, actor, action, target, details = {}) {
  await db.collection("auditLog").add({
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    action,
    target,
    details,
    at: new Date().toISOString(),
  });
}
