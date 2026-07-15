import { NextResponse } from "next/server";
import { requireManager, jsonError, audit } from "@/lib/server";
import { getScoring } from "@/lib/points";

export async function GET(request) {
  const { db, error } = await requireManager(request);
  if (error) return error;
  return NextResponse.json({ scoring: await getScoring(db) });
}

// Update point values. Changes apply going forward only; every change is audited.
export async function POST(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const current = await getScoring(db);
  const next = { ...current };

  for (const key of ["submit", "start", "day30"]) {
    const pts = Number(body?.[key]?.pts);
    const cash = Number(body?.[key]?.cash ?? 0);
    if (!Number.isFinite(pts) || pts < 0 || pts > 100000) {
      return jsonError(`Invalid points for ${key}.`);
    }
    if (!Number.isFinite(cash) || cash < 0 || cash > 100000) {
      return jsonError(`Invalid cash amount for ${key}.`);
    }
    next[key] = { ...current[key], pts: Math.round(pts), cash: Math.round(cash) };
  }

  const custom = [];
  for (const m of Array.isArray(body.custom) ? body.custom : []) {
    const name = String(m.name || "").trim();
    const days = Number(m.days);
    const pts = Number(m.pts);
    const cash = Number(m.cash ?? 0);
    if (name.length < 2) return jsonError("Name each custom milestone.");
    if (!Number.isInteger(days) || days < 1 || days > 3650) return jsonError(`Invalid days for ${name}.`);
    if (!Number.isFinite(pts) || pts < 0 || pts > 100000) return jsonError(`Invalid points for ${name}.`);
    if (!Number.isFinite(cash) || cash < 0 || cash > 100000) return jsonError(`Invalid cash for ${name}.`);
    custom.push({
      id: m.id && /^c\d+$/.test(m.id) ? m.id : `c${Date.now()}${custom.length}`,
      name,
      days,
      pts: Math.round(pts),
      cash: Math.round(cash),
    });
  }
  next.custom = custom;

  await db.collection("config").doc("scoring").set(next);
  await audit(db, user, "scoring.update", "config/scoring", {
    from: {
      submit: current.submit, start: current.start, day30: current.day30,
    },
    to: {
      submit: next.submit, start: next.start, day30: next.day30,
    },
  });

  return NextResponse.json({ ok: true, scoring: next, message: "Scoring updated." });
}
