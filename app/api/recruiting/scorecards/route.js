import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS } from "@/lib/constants";
import {
  getRoles,
  rolesFor,
  INTERVIEW_TYPES,
  INTERVIEW_LABEL,
  ITEM_TYPES,
  formKey,
} from "@/lib/recruiting";

// Interview forms, one per department + role + interview type. Recruiters and
// execs build them for any department; a department manager builds their own.
// Published means locked — reopening it for edits only affects interviews
// scored from then on, because finished scorecards are snapshots.

function canEdit(v2, dept) {
  return v2.allDepts || dept === v2.scopeDept;
}

export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const url = new URL(request.url);
  const dept = String(url.searchParams.get("dept") || "").trim();
  const role = String(url.searchParams.get("role") || "").trim();
  const ivType = String(url.searchParams.get("ivType") || "").trim();

  if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");
  if (!INTERVIEW_TYPES.includes(ivType)) return jsonError("Pick an interview type.");
  if (!canEdit(v2, dept) && !v2.allDepts) return jsonError("That's outside your department.", 403);

  const roles = await getRoles(db);
  if (!rolesFor(roles, dept).includes(role)) return jsonError("Pick a role for that department.");

  const id = formKey(dept, role, ivType);
  const snap = await db.collection("scorecardForms").doc(id).get();
  const form = snap.exists
    ? { id, ...snap.data() }
    : { id, dept, role, ivType, sections: [], status: "draft" };

  return NextResponse.json({ form, canEdit: canEdit(v2, dept) });
}

export async function POST(request) {
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const dept = String(body.dept || "").trim();
  const role = String(body.role || "").trim();
  const ivType = String(body.ivType || "").trim();

  if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");
  if (!INTERVIEW_TYPES.includes(ivType)) return jsonError("Pick an interview type.");
  if (!canEdit(v2, dept)) return jsonError("You can only build forms for your own department.", 403);

  const roles = await getRoles(db);
  if (!rolesFor(roles, dept).includes(role)) return jsonError("Pick a role for that department.");

  const status = body.status === "published" ? "published" : "draft";
  if (!Array.isArray(body.sections)) return jsonError("Send the form's sections.");

  // Ids come from the client so a half-built form keeps its shape between
  // saves; anything missing one gets a fresh one here.
  let n = 0;
  const nextId = (p) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

  const sections = body.sections.slice(0, 20).map((s) => ({
    id: String(s.id || nextId("s")).slice(0, 40),
    label: String(s.label || "").trim().slice(0, 80) || "Untitled section",
    items: (Array.isArray(s.items) ? s.items : []).slice(0, 30).map((it) => ({
      id: String(it.id || nextId("i")).slice(0, 40),
      type: ITEM_TYPES.includes(it.type) ? it.type : "graded",
      text: String(it.text || "").trim().slice(0, 300),
    })),
  }));

  if (status === "published") {
    const items = sections.flatMap((s) => s.items);
    if (!items.length) return jsonError("Add at least one question before publishing.");
    if (items.some((it) => !it.text)) return jsonError("Every question needs wording before publishing.");
  }

  const id = formKey(dept, role, ivType);
  const ref = db.collection("scorecardForms").doc(id);
  const before = await ref.get();

  await ref.set(
    {
      dept,
      role,
      ivType,
      sections,
      status,
      updatedBy: user.uid,
      updatedByName: user.name,
      updatedAt: new Date().toISOString(),
      demo: false,
    },
    { merge: true }
  );

  await audit(db, user, "v2.scorecardForm.save", id, {
    dept,
    role,
    ivType: INTERVIEW_LABEL[ivType],
    status,
    was: before.exists ? before.data().status : "new",
    sections: sections.length,
    questions: sections.reduce((t, s) => t + s.items.length, 0),
  });

  return NextResponse.json({
    ok: true,
    message: status === "published" ? "Form published and locked." : "Draft saved.",
  });
}
