import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS } from "@/lib/constants";
import { getRoles, rolesFor, isDateOnly, seatState } from "@/lib/recruiting";

// Training classes. One document per class: it starts as a request (department,
// role, date, location, headcount) and later gains its roster and outcome
// fields once its date has passed — decision 3A.1, one record that matures,
// so a class never has two identities.

export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const [classSnap, candSnap] = await Promise.all([
    db.collection("classes").get(),
    db.collection("candidates").get(),
  ]);

  const inScope = (dept) => v2.allDepts || dept === v2.scopeDept;

  const candidates = candSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const classes = classSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => inScope(c.dept))
    .map((c) => {
      const mine = candidates.filter((p) => p.classId === c.id);
      return {
        ...c,
        // Seats ignore rejected candidates; this counts everyone still
        // pointing at the class, which is what blocks deleting or moving it.
        attached: mine.length,
        seats: seatState(mine, c.target),
        candidates: mine
          .filter((p) => !["rejected", "offer_rejected"].includes(p.stage))
          .map((p) => ({
            id: p.id,
            name: p.name,
            stage: p.stage,
            role: p.role,
            referrerName: p.referrerName || null,
          })),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ classes, scopeDept: v2.scopeDept });
}

// Request a class. Managers request for their own department; recruiters and
// execs may request for any.
export async function POST(request) {
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const dept = v2.allDepts ? String(body.dept || "").trim() : v2.scopeDept;
  if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");
  if (!v2.allDepts && dept !== v2.scopeDept) return jsonError("That's outside your department.", 403);

  const roles = await getRoles(db);
  const role = String(body.role || "").trim();
  if (!rolesFor(roles, dept).includes(role)) return jsonError("Pick a role for that department.");

  if (!isDateOnly(body.date)) return jsonError("Pick a class start date.");
  const target = parseInt(body.target, 10);
  if (!Number.isFinite(target) || target < 1 || target > 40) {
    return jsonError("How many people should this class hold? (1–40)");
  }
  const location = String(body.location || "").trim().slice(0, 120) || "TBD";

  const now = new Date().toISOString();
  const ref = await db.collection("classes").add({
    dept,
    role,
    date: body.date,
    location,
    target,
    createdBy: user.uid,
    createdByName: user.name,
    createdAt: now,
    demo: false,
  });

  await audit(db, user, "v2.class.request", ref.id, { dept, role, date: body.date, location, target });

  return NextResponse.json({ ok: true, id: ref.id, message: `Class requested — ${role}, ${body.date}.` });
}
