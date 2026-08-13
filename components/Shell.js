"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { api, getViewAs } from "@/lib/firebaseClient";

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

// Cumulative-path labels for the breadcrumb trail. Pages not listed
// (login, public apply) don't render Shell, so they never show crumbs.
const CRUMBS = {
  "/home": "Home",
  "/submit": "Submit",
  "/my-referrals": "My referrals",
  "/earnings": "Earnings",
  "/prizes": "Prizes & goals",
  "/share": "Share & recruit",
  "/leaderboard": "Leaderboard",
  "/notifications": "Notifications",
  "/manage": "Manage",
  "/manage/referrals": "Referrals",
  "/manage/recruiting": "Recruiting",
  "/manage/pipeline": "Pipeline",
  "/manage/report": "Reporting",
  "/manage/people": "People",
  "/manage/scoring": "Scoring",
  "/manage/prizes": "Prizes",
  "/manage/hires": "Hires",
};

function Crumbs({ pathname }) {
  if (!pathname || pathname === "/home") return null;
  const trail = [{ href: "/home", label: "Home" }];
  let acc = "";
  for (const part of pathname.split("/").filter(Boolean)) {
    acc += `/${part}`;
    if (CRUMBS[acc]) trail.push({ href: acc, label: CRUMBS[acc] });
  }
  if (trail.length < 2) return null;
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((c, i) =>
        i < trail.length - 1 ? (
          <span key={c.href}>
            <Link href={c.href}>{c.label}</Link>
            <span className="csep">›</span>
          </span>
        ) : (
          <span key={c.href} className="chere">{c.label}</span>
        )
      )}
    </nav>
  );
}

const NAV = [
  { href: "/home", label: "Home", icon: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></> },
  { href: "/submit", label: "Submit", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></> },
  { href: "/my-referrals", label: "Refs", icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  { href: "/earnings", label: "Earnings", icon: <><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
  { href: "/share", label: "Share", icon: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></> },
];

export default function Shell({ children, wide = false, nav = true }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [viewAs, setViewAs] = useState(null);

  useEffect(() => {
    setViewAs(getViewAs());
  }, []);

  // Clear local state first so the exit call itself isn't sent as the target
  // (the server rejects any non-GET while the view-as header is attached).
  async function exitViewAs() {
    const va = getViewAs();
    sessionStorage.removeItem("viewAs");
    try {
      await api("/api/admin/view-as", { method: "DELETE", body: { uid: va?.uid, name: va?.name } });
    } catch {}
    window.location.href = "/manage/people";
  }

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
      {viewAs && (
        <div className="viewas">
          Viewing as <b>{viewAs.name}</b> — read-only
          <button onClick={exitViewAs}>Exit</button>
        </div>
      )}
      <div className="header">
        <Link href="/home" style={{ textDecoration: "none" }}>
          <div className="wordmark"><span className="cur">CURRENT</span><span className="home">HOME</span></div>
          <div className="subtag">EMPLOYEE REFERRALS</div>
        </Link>
        <Bell />
      </div>
      <div className={wide ? "wrap wide" : "wrap"}>
        <Crumbs pathname={pathname} />
        {children}
      </div>
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
