import { NextResponse } from "next/server";
import { requireManager, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS, phoneKey, formatPhone } from "@/lib/constants";
import { sendMail } from "@/lib/mail";

export async function GET(request) {
  const { db, error } = await requireManager(request);
  if (error) return error;

  const [usersSnap, invitesSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("invites").get(),
  ]);

  const people = usersSnap.docs.map((d) => ({
    uid: d.id,
    ...d.data(),
    status: d.data().active === false ? "Inactive" : "Active",
  }));
  const invites = invitesSnap.docs.map((d) => ({ email: d.id, ...d.data(), status: "Invited" }));

  return NextResponse.json({ people, invites });
}

async function countOtherActiveManagers(db, exceptUid) {
  const snap = await db.collection("users").where("role", "in", ["manager", "admin"]).get();
  return snap.docs.filter((d) => d.id !== exceptUid && d.data().active !== false).length;
}

// Actions: invite (pre-assign role/dept to an email), setRole, setDept, setActive.
export async function POST(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.endsWith("@currenthome.com")) return jsonError("Use a currenthome.com email.");
    if (!DEPARTMENTS.includes(body.dept)) return jsonError("Pick a department.");
    const role = body.role === "manager" ? "manager" : "employee";
    const inviteKey = phoneKey(body.phone || "");
    if (body.phone && inviteKey.length !== 10) return jsonError("Enter a valid 10-digit phone (or leave it blank).");
    const name = String(body.name || "").trim().slice(0, 100);
    await db.collection("invites").doc(email).set({
      name,
      dept: body.dept,
      phone: body.phone ? formatPhone(inviteKey) : "",
      role,
      invitedBy: user.name,
      createdAt: new Date().toISOString(),
    });
    await audit(db, user, "people.invite", email, { dept: body.dept, role });

    const base = process.env.NEXT_PUBLIC_APP_URL || "https://ch-referral-app.vercel.app";
    const mail = await sendMail({
      to: [email],
      subject: "You're invited to the Current Home Referral Program",
      text:
        `Hi ${name || "there"},\n\n` +
        `${user.name} added you to the Current Home referral platform.\n\n` +
        `Sign in with your Current Home Google account — no separate password needed:\n` +
        `${base}/login\n\n` +
        `Refer great people, track your referrals, and earn rewards.`,
    });

    return NextResponse.json({
      ok: true,
      message: mail.sent
        ? `${email} is set up as ${role} in ${body.dept} — invite email sent.`
        : `${email} is set up as ${role} in ${body.dept} — they just sign in with Google. (Invite email didn't go out.)`,
    });
  }

  const targetUid = body.uid;
  if (!targetUid) return jsonError("Missing user");
  const targetRef = db.collection("users").doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return jsonError("User not found", 404);
  const target = targetSnap.data();

  if (action === "setRole") {
    const role = ["admin", "manager", "employee"].includes(body.role) ? body.role : "employee";
    // Admin access is granted and revoked only by admins.
    if ((role === "admin" || target.role === "admin") && user.role !== "admin") {
      return jsonError("Only an admin can change admin access.");
    }
    if (targetUid === user.uid && target.role === "admin" && role !== "admin") {
      return jsonError("You can't remove your own admin access.");
    }
    if (["manager", "admin"].includes(target.role) && role === "employee") {
      const others = await countOtherActiveManagers(db, targetUid);
      if (others === 0) return jsonError("Blocked: this is the last active manager.");
    }
    await targetRef.update({ role });
    await audit(db, user, "people.setRole", targetUid, { email: target.email, role });
    return NextResponse.json({ ok: true, message: `${target.name} is now ${role}.` });
  }

  if (action === "setDept") {
    if (!DEPARTMENTS.includes(body.dept)) return jsonError("Pick a department.");
    await targetRef.update({ dept: body.dept });
    await audit(db, user, "people.setDept", targetUid, { email: target.email, dept: body.dept });
    return NextResponse.json({ ok: true, message: `${target.name} moved to ${body.dept}.` });
  }

  if (action === "setPhone") {
    const key = phoneKey(body.phone || "");
    if (body.phone && key.length !== 10) return jsonError("Enter a valid 10-digit phone.");
    const phone = body.phone ? formatPhone(key) : "";
    await targetRef.update({ phone });
    await audit(db, user, "people.setPhone", targetUid, { email: target.email, phone });
    return NextResponse.json({ ok: true, message: `${target.name}'s phone ${phone ? "updated" : "cleared"}.` });
  }

  if (action === "setActive") {
    const active = !!body.active;
    if (!active && target.role === "admin" && user.role !== "admin") {
      return jsonError("Only an admin can deactivate an admin.");
    }
    if (!active && ["manager", "admin"].includes(target.role)) {
      const others = await countOtherActiveManagers(db, targetUid);
      if (others === 0) return jsonError("Blocked: this is the last active manager.");
    }
    await targetRef.update({ active });
    await audit(db, user, "people.setActive", targetUid, { email: target.email, active });
    return NextResponse.json({ ok: true, message: `${target.name} ${active ? "reactivated" : "deactivated"}.` });
  }

  return jsonError("Unknown action");
}
