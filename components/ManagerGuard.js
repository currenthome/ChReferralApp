"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

// Client-side gate for manager pages. The real enforcement is server-side in
// every /api/manage route — this just keeps employees from seeing empty screens.
export default function ManagerGuard({ children }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile && profile.role !== "manager") router.replace("/home");
  }, [loading, profile, router]);

  if (!profile || profile.role !== "manager") return <div className="spinner">Loading…</div>;
  return children;
}
