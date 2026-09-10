import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { getV2Config } from "../../config/route";

// The parts of a class that can't be worked out from the app: the applicant
// numbers copied over from the ATS, and what the class cost to run.

async function loadClass(db, id, v2) {
  const ref = db.collection("classes").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: jsonError("Class not found", 404) };
  const cls = { id, ...snap.data() };
  if (!v2.allDepts && cls.dept !== v2.scopeDept) {
    return { error: jsonError("That class is outside your department.", 403) };
  }
  return { ref, cls };
}

const FUNNEL_FIELDS = ["applicants", "adApplications", "prescreens", "interviewed"];

export async function POST(request, { params }) {
  // Numbers on a report are entered by executives only. Everyone else reads
  // them — Justin's call after the September 10 call with Skip and Lauren,
  // which overrides the spec's original allowance for a department manager to
  // enter their own department's ATS data.
  const { user, db, error, v2 } = await requireV2(request, { minLevel: "exec" });
  if (error) return error;

  const { id } = await params;
  const loaded = await loadClass(db, id, v2);
  if (loaded.error) return loaded.error;
  const { ref, cls } = loaded;

  const body = await request.json().catch(() => ({}));

  if (body.action === "funnel") {
    const funnel = { ...(cls.funnel || {}) };
    let touched = false;
    FUNNEL_FIELDS.forEach((f) => {
      if (body[f] === undefined) return;
      const n = Number(body[f]);
      funnel[f] = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
      touched = true;
    });
    if (!touched) return jsonError("Nothing to save.");

    await ref.update({ funnel });
    await audit(db, user, "v2.class.funnel", id, { dept: cls.dept, role: cls.role, funnel });
    return NextResponse.json({ ok: true, message: "Applicant numbers saved." });
  }

  if (body.action === "costs") {
    // Only the categories that are entered per class — the monthly pools are
    // saved somewhere else, by an exec.
    const { costFields } = await getV2Config(db);
    const allowed = costFields.filter((f) => f.type === "direct").map((f) => f.id);
    const costs = { ...(cls.costs || {}) };
    let touched = false;
    Object.entries(body.costs || {}).forEach(([k, v]) => {
      if (!allowed.includes(k)) return;
      const n = Number(v);
      costs[k] = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
      touched = true;
    });
    if (!touched) return jsonError("Nothing to save.");

    await ref.update({ costs });
    await audit(db, user, "v2.class.costs", id, { dept: cls.dept, role: cls.role, costs });
    return NextResponse.json({ ok: true, message: "Class costs saved." });
  }

  return jsonError("Unknown action");
}
