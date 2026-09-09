import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { DEFAULT_COST_FIELDS, DEFAULT_REASONS } from "@/lib/reporting";

// The shared settings: what cost categories exist, and the list of reasons
// people leave. Everyone with recruiting access reads them. Only executives
// change them, because a change here rewrites every department's report,
// including months already closed (decision 3A.3).

export async function getV2Config(db) {
  const [costSnap, reasonSnap] = await Promise.all([
    db.collection("config").doc("v2CostFields").get(),
    db.collection("config").doc("v2Reasons").get(),
  ]);
  return {
    costFields: costSnap.exists ? costSnap.data().fields || DEFAULT_COST_FIELDS : DEFAULT_COST_FIELDS,
    reasons: reasonSnap.exists ? reasonSnap.data().reasons || DEFAULT_REASONS : DEFAULT_REASONS,
  };
}

export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;
  const config = await getV2Config(db);
  return NextResponse.json({ ...config, canEdit: v2.level === "exec" });
}

export async function POST(request) {
  const { user, db, error } = await requireV2(request, { minLevel: "exec" });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const current = await getV2Config(db);

  if (Array.isArray(body.costFields)) {
    const fields = body.costFields
      .map((f) => ({
        id: String(f.id || "").trim().slice(0, 40),
        label: String(f.label || "").trim().slice(0, 60),
        type: f.type === "overhead" ? "overhead" : "direct",
      }))
      .filter((f) => f.id && f.label)
      .slice(0, 30);
    if (!fields.length) return jsonError("Keep at least one cost category.");

    // A category with money already entered against it can't just vanish, or
    // past totals would silently change.
    const removed = current.costFields.filter((f) => !fields.some((n) => n.id === f.id));
    if (removed.length) {
      const [classSnap, ohSnap] = await Promise.all([
        db.collection("classes").get(),
        db.collection("v2Overhead").get(),
      ]);
      const used = removed.filter(
        (f) =>
          classSnap.docs.some((d) => Number(d.data().costs?.[f.id] || 0) > 0) ||
          ohSnap.docs.some((d) => Number(d.data()[f.id] || 0) > 0)
      );
      if (used.length) {
        return jsonError(
          `${used.map((f) => f.label).join(", ")} has money entered against it — zero those out first.`
        );
      }
    }

    await db.collection("config").doc("v2CostFields").set({ fields }, { merge: true });
    await audit(db, user, "v2.costFields.update", "config/v2CostFields", {
      from: current.costFields.length,
      to: fields.length,
    });
    return NextResponse.json({ ok: true, message: "Cost categories saved." });
  }

  if (Array.isArray(body.reasons)) {
    const reasons = body.reasons
      .map((r) => ({
        id: String(r.id || "").trim().slice(0, 40),
        label: String(r.label || "").trim().slice(0, 60),
      }))
      .filter((r) => r.id && r.label)
      .slice(0, 40);
    if (!reasons.length) return jsonError("Keep at least one reason.");

    // Same rule for reasons: one that's already assigned to somebody stays.
    const removed = current.reasons.filter((r) => !reasons.some((n) => n.id === r.id));
    if (removed.length) {
      const candSnap = await db.collection("candidates").get();
      const used = removed.filter((r) =>
        candSnap.docs.some((d) => d.data().termReasonId === r.id)
      );
      if (used.length) {
        return jsonError(
          `${used.map((r) => r.label).join(", ")} is assigned to someone — change theirs first.`
        );
      }
    }

    await db.collection("config").doc("v2Reasons").set({ reasons }, { merge: true });
    await audit(db, user, "v2.reasons.update", "config/v2Reasons", {
      from: current.reasons.length,
      to: reasons.length,
    });
    return NextResponse.json({ ok: true, message: "Reasons saved." });
  }

  return jsonError("Send either costFields or reasons.");
}
