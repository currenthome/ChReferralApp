import { NextResponse } from "next/server";
import { requireV2 } from "@/lib/server";
import { todayCompanyDate } from "@/lib/reporting";
import { getV2Config } from "../config/route";

// Everything the report screens work from, in one call: the classes in scope,
// the people hired into each of them, the monthly overhead pools, and the
// shared settings. The arithmetic itself lives in lib/reporting.js so the
// screens and the server can't end up with two different answers.
export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const [classSnap, candSnap, ohSnap, config] = await Promise.all([
    db.collection("classes").get(),
    db.collection("candidates").get(),
    db.collection("v2Overhead").get(),
    getV2Config(db),
  ]);

  const classes = classSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => v2.allDepts || c.dept === v2.scopeDept)
    .sort((a, b) => b.date.localeCompare(a.date));

  // A class's roster is simply the people hired into it — no second list to
  // keep in step (decision 3A.1). Only the parts a person has to tell us are
  // stored: did they show up, did they graduate, and if they left, when.
  const today = todayCompanyDate();
  const ids = new Set(classes.map((c) => c.id));
  const peopleByClass = {};
  candSnap.docs.forEach((d) => {
    const c = d.data();
    if (c.stage !== "hired" || !c.classId || !ids.has(c.classId)) return;
    (peopleByClass[c.classId] = peopleByClass[c.classId] || []).push({
      id: d.id,
      name: c.name,
      role: c.role,
      startDate: c.startDate || null,
      // Nobody has to confirm the obvious: once a person's first day has come
      // and gone they count as started. Marking them is only needed to record
      // a no-show, which is what started === false means.
      started: typeof c.started === "boolean" ? c.started : !!c.startDate && c.startDate <= today,
      graduated: !!c.graduated,
      terminationDate: c.terminationDate || null,
      termReasonId: c.termReasonId || null,
      referrerName: c.referrerName || null,
    });
  });

  const overhead = {};
  ohSnap.docs.forEach((d) => {
    overhead[d.id] = d.data();
  });

  return NextResponse.json({
    today,
    classes,
    peopleByClass,
    overhead,
    costFields: config.costFields,
    reasons: config.reasons,
    level: v2.level,
    scopeDept: v2.scopeDept,
  });
}
