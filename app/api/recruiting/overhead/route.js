import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { getV2Config } from "../config/route";

// Monthly overhead — payroll, tools, anything that isn't tied to one class.
// Entered once a month and split across that month's classes by how many
// people each one hired. Executives only, like the other shared settings.

export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const snap = await db.collection("v2Overhead").get();
  const overhead = {};
  snap.docs.forEach((d) => {
    overhead[d.id] = d.data();
  });
  return NextResponse.json({ overhead, canEdit: v2.level === "exec" });
}

export async function POST(request) {
  const { user, db, error } = await requireV2(request, { minLevel: "exec" });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const month = String(body.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return jsonError("Which month?");

  const { costFields } = await getV2Config(db);
  const allowed = costFields.filter((f) => f.type === "overhead").map((f) => f.id);

  const amounts = {};
  Object.entries(body.amounts || {}).forEach(([k, v]) => {
    if (!allowed.includes(k)) return;
    const n = Number(v);
    amounts[k] = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  });
  if (!Object.keys(amounts).length) return jsonError("Nothing to save for that month.");

  await db.collection("v2Overhead").doc(month).set({ ...amounts, demo: false }, { merge: true });
  await audit(db, user, "v2.overhead.update", month, amounts);

  return NextResponse.json({ ok: true, message: `${month} overhead saved.` });
}
