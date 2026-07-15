import { NextResponse } from "next/server";
import { requireManager, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS } from "@/lib/constants";

// Department lock: a manager runs their own department's prizes;
// Recruiting-department managers run any department plus company-wide.
function canManageDept(user, dept) {
  if (user.dept === "Recruiting") return true;
  return dept === user.dept;
}

export async function GET(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const snap = await db.collection("prizes").get();
  const prizes = snap.docs
    .map((d) => ({ id: d.id, ...d.data(), canManage: canManageDept(user, d.data().dept) }))
    .sort((a, b) => (a.dept < b.dept ? -1 : a.dept > b.dept ? 1 : a.deadline < b.deadline ? -1 : 1));

  return NextResponse.json({
    prizes,
    myDept: user.dept,
    seesAll: user.dept === "Recruiting",
  });
}

export async function POST(request) {
  const { user, db, error } = await requireManager(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));

  if (body.action === "delete") {
    const snap = await db.collection("prizes").doc(body.id).get();
    if (!snap.exists) return jsonError("Prize not found", 404);
    if (!canManageDept(user, snap.data().dept)) {
      return jsonError("You can only manage your own department's prizes.", 403);
    }
    await snap.ref.delete();
    await audit(db, user, "prize.delete", body.id, { reward: snap.data().reward });
    return NextResponse.json({ ok: true, message: "Prize removed." });
  }

  const reward = String(body.reward || "").trim();
  const type = body.type === "Target" ? "Target" : "Race";
  const metric = ["hires", "points", "referrals", "cash"].includes(body.metric) ? body.metric : "hires";
  const target = Number(body.target) || 0;
  const deadline = String(body.deadline || "");
  const dept = String(body.dept || "");

  if (reward.length < 3) return jsonError("Name the reward.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return jsonError("Pick a deadline.");
  if (deadline < new Date().toISOString().slice(0, 10)) return jsonError("Deadline is in the past.");
  if (dept !== "Company-wide" && !DEPARTMENTS.includes(dept)) return jsonError("Pick who can see it.");
  if (!canManageDept(user, dept)) return jsonError("You can only create prizes for your own department.", 403);
  if (type === "Target" && target <= 0) return jsonError("Set the goal to reach.");

  const ref = await db.collection("prizes").add({
    reward,
    type,
    metric,
    target,
    deadline,
    dept,
    createdByUid: user.uid,
    createdByName: user.name,
    createdAt: new Date().toISOString(),
  });
  await audit(db, user, "prize.create", ref.id, { reward, type, metric, target, deadline, dept });
  return NextResponse.json({ ok: true, message: `Prize created for ${dept}.` });
}
