"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";

function ago(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export default function Notifications() {
  const { profile } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState(null);

  const load = () => api("/api/notifications").then((d) => setItems(d.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  async function markAll() {
    await api("/api/notifications", { method: "POST", body: {} });
    load();
  }

  async function open(n) {
    await api("/api/notifications", { method: "POST", body: { id: n.id } });
    router.push(profile?.role === "manager" && n.type !== "stage" ? "/manage/referrals" : "/my-referrals");
  }

  return (
    <Shell>
      <div className="nhead">
        <h1 style={{ margin: 0 }}>Notifications</h1>
        <button className="markall" onClick={markAll}>Mark all read</button>
      </div>
      <p className="sub" style={{ marginBottom: 18 }}>Updates on referrals — jump in and take action fast.</p>

      {!items && <div className="spinner">Loading…</div>}
      {items && items.length === 0 && <p className="note">You're all caught up.</p>}

      {items?.map((n) => (
        <div key={n.id} className={`ncard ${n.read ? "read" : "unread"}`}>
          <div className="ndot" />
          <div className="nmid">
            <div className="nlabel">
              {(n.type === "new" ? "NEW REFERRAL · " : n.type === "duplicate" ? "DUPLICATE · " : "UPDATE · ") + (n.dept || "").toUpperCase()}
            </div>
            <div className="ncand">{n.candidateName}</div>
            <div className="nmeta">{n.message} · {ago(n.at)}</div>
            <button className="nreview" onClick={() => open(n)}>
              {n.type === "stage" ? "View referral ›" : "Review referral ›"}
            </button>
          </div>
        </div>
      ))}
    </Shell>
  );
}
