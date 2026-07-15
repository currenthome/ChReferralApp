import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";

// Returns (and creates on first use) the caller's personal share code,
// plus how many people applied through their link.
export async function GET(request) {
  const { user, db, error } = await requireUser(request);
  if (error) return error;

  let code = user.shareCode;
  if (!code) {
    // Short, unguessable, stable per user.
    code = Buffer.from(user.uid).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase();
    await db.collection("users").doc(user.uid).update({ shareCode: code });
    await db.collection("shareCodes").doc(code).set({ uid: user.uid, name: user.name });
  }

  const applied = await db
    .collection("referrals")
    .where("referrerUid", "==", user.uid)
    .where("source", "==", "self-apply")
    .get();

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://ch-referral-app.vercel.app";
  return NextResponse.json({
    code,
    link: `${base}/apply/${code}`,
    appliedCount: applied.size,
  });
}
