import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireManager, jsonError, audit } from "@/lib/server";
import { STAGES, HIRED_STAGE } from "@/lib/constants";
import { notifyReferrer } from "@/lib/notify";

// Stage actions: advance, back, out (not moving forward), reopen, setStart.
// Points are awarded by the daily cron when start/day-30 dates arrive —
// never here, so a mis-click corrected with "back" costs nothing.
export async function POST(request, { params }) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  const ref = db.collection("referrals").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Referral not found", 404);
  const r = { id, ...snap.data() };

  const now = new Date().toISOString();
  const update = { stageChangedAt: now };
  let note = "";

  if (action === "advance") {
    if (r.out) return jsonError("Reopen this referral first.");
    if (r.stage >= HIRED_STAGE) return jsonError("Already hired.");
    update.stage = r.stage + 1;
    update.timeline = [...(r.timeline || []), { stage: STAGES[update.stage], at: now }];
    note = `${r.candidateName} moved to “${STAGES[update.stage]}”.`;
  } else if (action === "back") {
    if (r.out) return jsonError("Reopen this referral first.");
    if (r.stage <= 0) return jsonError("Already at the first stage.");
    update.stage = r.stage - 1;
    update.timeline = (r.timeline || []).slice(0, -1);
    if (r.stage === HIRED_STAGE) update.startDate = null; // no longer hired
    note = `${r.candidateName} moved back to “${STAGES[update.stage]}”.`;
  } else if (action === "out") {
    if (r.out) return jsonError("Already marked not moving forward.");
    update.out = true;
    update.timeline = [...(r.timeline || []), { stage: "Not moving forward", at: now }];
    note = `${r.candidateName} is not moving forward.`;
  } else if (action === "reopen") {
    if (!r.out) return jsonError("This referral is still open.");
    update.out = false;
    update.timeline = (r.timeline || []).filter((t) => t.stage !== "Not moving forward");
    note = `${r.candidateName} was reopened at “${STAGES[r.stage]}”.`;
  } else if (action === "setStart") {
    if (r.stage !== HIRED_STAGE || r.out) return jsonError("Set a start date after marking Hired.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.startDate || "")) return jsonError("Pick a valid start date.");
    update.startDate = body.startDate;
    note = `${r.candidateName}'s start date is set — points award automatically from their first day.`;
  } else if (action === "setLead") {
    update.lead = body.lead === "manager" ? "manager" : "recruiting";
    update.ownerUid = body.lead === "manager" ? user.uid : "";
    update.ownerName = body.lead === "manager" ? user.name : "";
    delete update.stageChangedAt; // routing isn't a stage change
    note = "";
  } else if (action === "claim") {
    update.ownerUid = user.uid;
    update.ownerName = user.name;
    delete update.stageChangedAt;
    note = `You're now working ${r.candidateName}.`;
  } else if (action === "nudge") {
    delete update.stageChangedAt;
    const days = Math.floor((Date.now() - new Date(r.stageChangedAt).getTime()) / 86400000);
    const { notifyManagers } = await import("@/lib/notify");
    await notifyManagers(db, {
      dept: r.dept,
      type: "nudge",
      referralId: id,
      candidateName: r.candidateName,
      byName: user.name,
      message: `Nudge from ${user.name}: ${r.candidateName} has been sitting ${days} day${days === 1 ? "" : "s"} at “${STAGES[r.stage]}” — please take action.`,
    });
    note = `Nudge sent to ${r.dept} managers.`;
  } else {
    return jsonError("Unknown action");
  }

  if (Object.keys(update).length) await ref.update(update);

  const details = { candidateName: r.candidateName, from: STAGES[r.stage] };
  if (update.stage !== undefined) details.to = STAGES[update.stage];
  if (update.startDate) details.startDate = update.startDate;
  if (update.lead) details.lead = update.lead;
  await audit(db, user, `referral.${action}`, id, details);

  // Bare, non-sensitive update to the referrer — in-app bell only, no email
  // (Skip's call: emails go out on submission, not pipeline moves).
  if (note && ["advance", "out", "reopen"].includes(action)) {
    await notifyReferrer(db, { referral: r, message: note, email: false });
  }

  return NextResponse.json({ ok: true, message: note || "Updated." });
}

// Permanently removes a submission and everything tied to it: points events
// (so the leaderboard and earnings drop them), bell notifications, and the
// uploaded resume. The audit log keeps a record of who deleted what.
export async function DELETE(request, { params }) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const { id } = await params;
  const ref = db.collection("referrals").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Referral not found", 404);
  const r = snap.data();

  const batch = db.batch();
  const pointsSnap = await db.collection("pointsEvents").where("referralId", "==", id).get();
  pointsSnap.docs.forEach((d) => batch.delete(d.ref));
  const notifSnap = await db.collection("notifications").where("referralId", "==", id).get();
  notifSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(ref);
  await batch.commit();

  if (r.resumeUrl) {
    try {
      await del(r.resumeUrl);
    } catch {
      // Blob may already be gone; the submission itself is deleted either way.
    }
  }

  await audit(db, user, "referral.delete", id, {
    candidateName: r.candidateName,
    referrerName: r.referrerName,
    stage: STAGES[r.stage],
    pointsEventsRemoved: pointsSnap.size,
  });

  return NextResponse.json({ ok: true, message: `${r.candidateName}'s submission was deleted.` });
}
