import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server";

export async function GET(request) {
  const { user, error } = await requireUser(request);
  if (error) return error;
  return NextResponse.json({
    uid: user.uid,
    email: user.email,
    name: user.name,
    dept: user.dept,
    role: user.role,
  });
}
