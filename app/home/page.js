"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";

function ActionButton({ href, title, sub, primary, manage }) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      <div className={`action${primary ? " primary" : ""}${manage ? " manage" : ""}`}>
        <span>
          <span className="at" style={manage ? { color: "#fff" } : undefined}>{title}</span>
          <span className="as" style={manage ? { color: "#c7c9d6" } : undefined}>{sub}</span>
        </span>
        <span className="chev" style={manage ? { color: "#fff" } : undefined}>›</span>
      </div>
    </Link>
  );
}

export default function Home() {
  const { profile, logout } = useAuth();
  const [board, setBoard] = useState(null);

  useEffect(() => {
    if (!profile) return;
    api("/api/leaderboard?range=month&scope=dept")
      .then(setBoard)
      .catch(() => setBoard({ rows: [] }));
  }, [profile]);

  const rows = board?.rows || [];
  const me = rows.find((r) => r.you);
  const top = rows[0]?.points || 0;
  const firstName = (profile?.name || "").split(" ")[0];

  return (
    <Shell>
      <p className="greet">Welcome back,</p>
      <p className="greetname">{firstName || "there"}</p>

      <div className="hero">
        <div>
          <div className="rank">{me ? `#${me.rank}` : "—"}</div>
          <div className="rlbl">of {rows.length || "—"} in {board?.scope || "your team"}</div>
        </div>
        <div>
          <div className="pts">{me?.points ?? 0}</div>
          <div className="plbl">points this month</div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <h3>You vs the field · {board.scope}</h3>
          {rows.slice(0, 8).map((r) => (
            <div key={r.uid} className={`crow${r.you ? " you" : ""}`}>
              <div className="cn">{r.you ? "You" : r.name.split(" ")[0]}</div>
              <div className="ctrack">
                <span className="cfill" style={{ width: `${top ? Math.max(4, (r.points / top) * 100) : 4}%` }} />
              </div>
              <div className="cp">{r.points}</div>
            </div>
          ))}
        </div>
      )}

      <ActionButton primary href="/submit" title="Submit a referral" sub="Know someone great? Add them in seconds." />
      <ActionButton href="/my-referrals" title="My referrals" sub="Track everyone you've referred and their status." />
      <ActionButton href="/earnings" title="My earnings" sub="See cash earned and what's still in your pipeline." />
      <ActionButton href="/prizes" title="Prizes & goals" sub="See what you can win and how close you are." />
      <ActionButton href="/share" title="Share & recruit" sub="Get your personal link and QR code to post." />
      <ActionButton href="/leaderboard" title="Leaderboard" sub="See how you stack up against the team." />
      {profile?.role === "manager" && (
        <ActionButton manage href="/manage" title="Manage" sub="Update funnel stages, invite and manage people." />
      )}

      <p className="note">
        Signed in as {profile?.email} · <button className="link" onClick={logout}>Sign out</button>
      </p>
    </Shell>
  );
}
