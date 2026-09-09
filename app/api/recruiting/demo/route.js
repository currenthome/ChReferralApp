import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";

// Demo data for UAT, and the button that removes it. Everything seeded carries
// demo: true; anything real doesn't. The purge only ever looks for that flag,
// so real records can't be caught up in it.
const COLLECTIONS = ["candidates", "classes", "scorecardForms", "v2Overhead", "referrals"];

// How much demo data is sitting there, so the screen can say what's about to go.
export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const counts = {};
  let total = 0;
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).where("demo", "==", true).get();
    if (snap.size) counts[name] = snap.size;
    total += snap.size;
  }
  return NextResponse.json({ counts, total, canPurge: v2.level === "exec" });
}

export async function DELETE(request) {
  const { user, db, error } = await requireV2(request, { minLevel: "exec" });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  // Typing the word is the confirmation — this can't be an accidental click.
  if (String(body.confirm || "").trim().toUpperCase() !== "PURGE") {
    return jsonError('Type PURGE to confirm.');
  }

  const removed = {};
  let total = 0;

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).where("demo", "==", true).get();
    if (!snap.size) continue;

    for (const doc of snap.docs) {
      // A candidate's interviews live underneath it and go with it.
      if (name === "candidates") {
        const ivs = await doc.ref.collection("interviews").get();
        const batch = db.batch();
        ivs.docs.forEach((iv) => batch.delete(iv.ref));
        if (ivs.size) await batch.commit();
      }
      await doc.ref.delete();
    }
    removed[name] = snap.size;
    total += snap.size;
  }

  await audit(db, user, "v2.demo.purge", "demo", { removed, total });

  return NextResponse.json({
    ok: true,
    removed,
    total,
    message: total
      ? `Removed ${total} demo record${total === 1 ? "" : "s"}. Real data untouched.`
      : "There was no demo data left to remove.",
  });
}
