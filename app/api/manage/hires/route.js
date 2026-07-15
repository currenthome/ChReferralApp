import { NextResponse } from "next/server";
import { requireManager, jsonError, audit } from "@/lib/server";
import { HIRED_STAGE, monthKey } from "@/lib/constants";

export async function GET(request) {
  const { db, error } = await requireManager(request);
  if (error) return error;

  const snap = await db.collection("referrals").where("stage", "==", HIRED_STAGE).get();
  const hires = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => !r.out)
    .map((r) => ({
      id: r.id,
      candidateName: r.candidateName,
      referrerName: r.referrerName,
      dept: r.dept,
      startDate: r.startDate,
      terminationDate: r.terminationDate || "",
      startAwarded: !!r.startAwarded,
      day30Awarded: !!r.day30Awarded,
    }))
    .sort((a, b) => ((a.startDate || "") < (b.startDate || "") ? 1 : -1));

  const frozenSnap = await db.collection("frozenMonths").get();
  const frozen = frozenSnap.docs.map((d) => d.id).sort().reverse();

  return NextResponse.json({ hires, currentMonth: monthKey(), frozen });
}

// Actions: setTermination (stops the milestone clock; never claws back),
// clearTermination, freezeMonth (snapshots the month's standings).
export async function POST(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));

  if (body.action === "setTermination" || body.action === "clearTermination") {
    const ref = db.collection("referrals").doc(body.id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError("Hire not found", 404);
    const r = snap.data();

    if (body.action === "setTermination") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) return jsonError("Pick a termination date.");
      await ref.update({ terminationDate: body.date });
      await audit(db, user, "hire.terminate", body.id, { candidateName: r.candidateName, date: body.date });
      return NextResponse.json({ ok: true, message: `${r.candidateName}'s milestone clock stops at ${body.date}. Points already earned stay.` });
    }
    await ref.update({ terminationDate: null });
    await audit(db, user, "hire.clearTermination", body.id, { candidateName: r.candidateName });
    return NextResponse.json({ ok: true, message: `${r.candidateName} is active again — milestones resume.` });
  }

  if (body.action === "freezeMonth") {
    const month = monthKey();
    const existing = await db.collection("frozenMonths").doc(month).get();
    if (existing.exists) return jsonError(`${month} is already frozen.`);

    const eventsSnap = await db.collection("pointsEvents").where("month", "==", month).get();
    const totals = {};
    eventsSnap.docs.forEach((d) => {
      const e = d.data();
      totals[e.uid] = totals[e.uid] || { points: 0, cash: 0 };
      totals[e.uid].points += e.points || 0;
      totals[e.uid].cash += e.cash || 0;
    });

    const usersSnap = await db.collection("users").get();
    const names = {};
    usersSnap.docs.forEach((d) => (names[d.id] = d.data().name));

    const rows = Object.entries(totals)
      .map(([uid, t]) => ({ uid, name: names[uid] || uid, ...t }))
      .sort((a, b) => b.points - a.points);

    await db.collection("frozenMonths").doc(month).set({
      rows,
      frozenBy: user.name,
      at: new Date().toISOString(),
    });
    await audit(db, user, "month.freeze", month, { entries: rows.length });
    return NextResponse.json({ ok: true, message: `${month} is frozen — ${rows.length} people on the snapshot.` });
  }

  return jsonError("Unknown action");
}
