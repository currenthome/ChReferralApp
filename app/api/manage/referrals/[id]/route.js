import { NextResponse } from "next/server";
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
    update.ownerName = body.lead === "manager" ? user.name : "";
    note = "";
  } else {
    return jsonError("Unknown action");
  }

  await ref.update(update);
  await audit(db, user, `referral.${action}`, id, {
    candidateName: r.candidateName,
    from: STAGES[r.stage],
    to: update.stage !== undefined ? STAGES[update.stage] : undefined,
    startDate: update.startDate,
  });

  // Bare, non-sensitive update to the referrer, per the locked spec.
  if (note && ["advance", "out", "reopen"].includes(action)) {
    await notifyReferrer(db, { referral: r, message: note });
  }

  return NextResponse.json({ ok: true, message: note || "Updated." });
}
