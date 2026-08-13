"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

// Client-side gate for manager pages. The real enforcement is server-side in
// every /api/manage route — this just keeps employees from seeing empty screens.
export default function ManagerGuard({ children }) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const allowed = profile && (profile.role === "manager" || profile.role === "admin");

  useEffect(() => {
    if (!loading && profile && !allowed) router.replace("/home");
  }, [loading, profile, allowed, router]);

  if (!allowed) return <div className="spinner">Loading…</div>;
  return children;
}
