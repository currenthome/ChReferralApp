"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

// Client-side gate for the recruiting screens. The real enforcement is
// server-side in requireV2 on every /api/recruiting route — this just keeps
// people without access from landing on an empty screen. Before launch,
// v2Visible is false for everyone outside the preview allow-list.
export default function V2Guard({ children }) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const allowed = !!profile?.v2Visible;

  useEffect(() => {
    if (!loading && profile && !allowed) router.replace("/home");
  }, [loading, profile, allowed, router]);

  if (!allowed) return <div className="spinner">Loading…</div>;
  return children;
}
