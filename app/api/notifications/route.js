import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";

export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const url = new URL(request.url);
  const countOnly = url.searchParams.get("countOnly");

  const snap = await db
    .collection("notifications")
    .where("toUid", "==", user.uid)
    .get();

  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  const unread = items.filter((n) => !n.read).length;
  if (countOnly) return NextResponse.json({ unread });
  return NextResponse.json({ items: items.slice(0, 50), unread });
}

// Mark one (id) or all notifications read.
export async function POST(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const snap = await db
    .collection("notifications")
    .where("toUid", "==", user.uid)
    .where("read", "==", false)
    .get();

  const batch = db.batch();
  snap.docs.forEach((d) => {
    if (!body.id || d.id === body.id) batch.update(d.ref, { read: true });
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
