"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/firebaseClient";

function Bell() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api("/api/notifications?countOnly=1")
        .then((d) => alive && setCount(d.unread))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <button className="bell" onClick={() => router.push("/notifications")} aria-label="Notifications">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && <span className="notif-badge">{count}</span>}
    </button>
  );
}

const NAV = [
  { href: "/home", label: "Home", icon: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></> },
  { href: "/submit", label: "Submit", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></> },
  { href: "/my-referrals", label: "Refs", icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  { href: "/leaderboard", label: "Board", icon: <><path d="M12 21V11" /><path d="M6 21v-6" /><path d="M18 21v-14" /></> },
];

export default function Shell({ children, wide = false, nav = true }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    document.body.classList.toggle("hasbar", nav);
    return () => document.body.classList.remove("hasbar");
  }, [nav]);

  if (loading || !user) return <div className="spinner">Loading…</div>;

  return (
    <>
      <div className="header">
        <Link href="/home" style={{ textDecoration: "none" }}>
          <div className="wordmark"><span className="cur">CURRENT</span><span className="home">HOME</span></div>
          <div className="subtag">EMPLOYEE REFERRALS</div>
        </Link>
        <Bell />
      </div>
      <div className={wide ? "wrap wide" : "wrap"}>{children}</div>
      {nav && (
        <nav className="botbar">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`bb${pathname === n.href ? " active" : ""}`}>
              <svg viewBox="0 0 24 24">{n.icon}</svg>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
