import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS } from "@/lib/constants";
import { getRoles, rolesFor, isDateOnly } from "@/lib/recruiting";
import { getV2Config } from "../../config/route";

// One class: correcting what was requested, deleting it, and the reporting
// figures that get typed in against it.

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
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  const { id } = await params;
  const loaded = await loadClass(db, id, v2);
  if (loaded.error) return loaded.error;
  const { ref, cls } = loaded;

  const body = await request.json().catch(() => ({}));

  // Getting the date wrong when you request a class shouldn't mean starting
  // over. Whoever can request one for a department can correct one.
  if (body.action === "edit") {
    const update = {};

    if (body.dept !== undefined || body.role !== undefined) {
      const dept = body.dept !== undefined ? String(body.dept).trim() : cls.dept;
      if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");
      if (!v2.allDepts && dept !== v2.scopeDept) {
        return jsonError("You can only move a class within your own department.", 403);
      }
      const roles = await getRoles(db);
      const role = body.role !== undefined ? String(body.role).trim() : cls.role;
      if (!rolesFor(roles, dept).includes(role)) return jsonError("Pick a role for that department.");

      // Anyone already lined up for this class was put there for this exact
      // department and role, so changing either would strand them.
      if (dept !== cls.dept || role !== cls.role) {
        const attached = await db.collection("candidates").where("classId", "==", id).get();
        if (!attached.empty) {
          return jsonError(
            `${attached.size} candidate${attached.size === 1 ? " is" : "s are"} already in this class, so its department and role can't change. Move them first, or make a new class.`
          );
        }
      }
      update.dept = dept;
      update.role = role;
    }

    if (body.date !== undefined) {
      if (!isDateOnly(body.date)) return jsonError("Pick a valid class start date.");
      update.date = body.date;
    }
    if (body.location !== undefined) {
      update.location = String(body.location).trim().slice(0, 120) || "TBD";
    }
    if (body.target !== undefined) {
      const target = parseInt(body.target, 10);
      if (!Number.isFinite(target) || target < 1 || target > 40) {
        return jsonError("How many people should this class hold? (1–40)");
      }
      update.target = target;
    }

    if (!Object.keys(update).length) return jsonError("Nothing to change.");

    await ref.update(update);
    await audit(db, user, "v2.class.edit", id, {
      dept: update.dept || cls.dept,
      role: update.role || cls.role,
      was: { dept: cls.dept, role: cls.role, date: cls.date, location: cls.location, target: cls.target },
      now: update,
    });
    return NextResponse.json({ ok: true, message: "Class updated." });
  }

  // The reporting figures are executives-only, unlike the class itself.
  if (body.action === "funnel" || body.action === "costs") {
    if (v2.level !== "exec") {
      return jsonError("Only an executive can change the figures on a report.", 403);
    }

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

    // Only the categories entered per class — the monthly pools are saved
    // somewhere else, by an exec.
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

// Deleting a class is for one requested by mistake. Only a hired candidate
// stops it: they're what the class's report counts. Anyone still interviewing,
// on hold or rejected appears in no report, so they're simply taken out of the
// class rather than standing in the way of removing it.
export async function DELETE(request, { params }) {
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  const { id } = await params;
  const loaded = await loadClass(db, id, v2);
  if (loaded.error) return loaded.error;
  const { ref, cls } = loaded;

  const attached = await db.collection("candidates").where("classId", "==", id).get();
  const hired = attached.docs.filter((d) => d.data().stage === "hired");
  if (hired.length) {
    const names = hired.slice(0, 3).map((d) => d.data().name).join(", ");
    return jsonError(
      `${hired.length} hired candidate${hired.length === 1 ? " is" : "s are"} in this class (${names}${hired.length > 3 ? "…" : ""}). A class its hires are counted against can't be deleted — move them to another class first.`
    );
  }

  const detached = attached.docs.filter((d) => d.data().stage !== "hired");
  for (const d of detached) await d.ref.update({ classId: null });

  await ref.delete();
  await audit(db, user, "v2.class.delete", id, {
    dept: cls.dept,
    role: cls.role,
    date: cls.date,
    location: cls.location,
    detached: detached.map((d) => d.data().name),
  });
  return NextResponse.json({
    ok: true,
    message: detached.length
      ? `${cls.role} class on ${cls.date} deleted. ${detached.length} candidate${detached.length === 1 ? " is" : "s are"} now not in a class.`
      : `${cls.role} class on ${cls.date} deleted.`,
  });
}
