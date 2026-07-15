import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getScoring, awardPoints } from "@/lib/points";
import { notifyReferrer } from "@/lib/notify";
import { HIRED_STAGE, COMPANY_TZ } from "@/lib/constants";

function todayCompanyDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Runs once a day (Vercel cron). Awards Start and Day-30 points for hires whose
// dates have arrived. A termination date stops future milestones; points already
// earned are never clawed back. The awarded flags make this safe to re-run.
export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const scoring = await getScoring(db);
  const today = todayCompanyDate();

  const snap = await db
    .collection("referrals")
    .where("stage", "==", HIRED_STAGE)
    .get();

  const awarded = [];
  for (const doc of snap.docs) {
    const r = { id: doc.id, ...doc.data() };
    if (r.out || !r.startDate) continue;

    const term = r.terminationDate || null;

    if (!r.startAwarded && today >= r.startDate && (!term || term >= r.startDate)) {
      await awardPoints(db, {
        uid: r.referrerUid,
        referralId: r.id,
        milestone: "start",
        points: scoring.start.pts,
      });
      await doc.ref.update({ startAwarded: true });
      await notifyReferrer(db, {
        referral: r,
        message: `${r.candidateName} started — you earned ${scoring.start.pts} points!`,
      });
      awarded.push({ id: r.id, milestone: "start" });
    }

    const day30Date = addDays(r.startDate, scoring.day30.days || 30);
    if (!r.day30Awarded && r.startAwarded !== false && today >= day30Date && (!term || term >= day30Date)) {
      await awardPoints(db, {
        uid: r.referrerUid,
        referralId: r.id,
        milestone: "day30",
        points: scoring.day30.pts,
      });
      await doc.ref.update({ day30Awarded: true });
      await notifyReferrer(db, {
        referral: r,
        message: `${r.candidateName} hit Day 30 — you earned ${scoring.day30.pts} points!`,
      });
      awarded.push({ id: r.id, milestone: "day30" });
    }
  }

  await db.collection("auditLog").add({
    actorUid: "system",
    actorName: "Daily cron",
    action: "cron.daily",
    target: today,
    details: { awarded: awarded.length },
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, today, awarded });
}
