"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/firebaseClient";

const METRIC_LABEL = { hires: "hires", points: "points", referrals: "referrals", cash: "cash earned" };
const fmt = (metric, v) => (metric === "cash" ? `$${Number(v).toLocaleString()}` : v);

export default function Prizes() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api("/api/prizes").then(setData).catch(() => setData({ prizes: [] }));
  }, []);

  if (!data) return <Shell><div className="spinner">Loading…</div></Shell>;

  return (
    <Shell>
      <h1>Prizes & goals</h1>
      <p className="sub" style={{ marginBottom: 18 }}>Challenges for your department and company-wide — and how close you are.</p>

      {data.prizes.length === 0 && (
        <p className="note" style={{ textAlign: "left" }}>No active challenges right now — check back soon.</p>
      )}

      {data.prizes.map((p) => {
        const isTarget = p.type === "Target";
        const pct = isTarget
          ? Math.min(100, Math.round(((p.mine || 0) / p.target) * 100))
          : p.leaderValue > 0
          ? Math.min(100, Math.round(((p.mine || 0) / p.leaderValue) * 100))
          : 0;
        const won = isTarget ? p.earned : p.leading;

        return (
          <div key={p.id} className="mcard" style={won ? { borderColor: "#9adcb0", background: "#f2fbf5" } : undefined}>
            <div className="rtop">
              <div>
                <div className="rname">{p.reward}</div>
                <div className="rmeta">
                  {p.dept} · by {p.createdByName} · ends {p.deadline}
                </div>
              </div>
              <span
                style={{
                  fontWeight: 700, fontSize: 9.5, letterSpacing: 1, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", flex: "none",
                  ...(isTarget ? { background: "var(--cyanlight)", color: "#0a7d8f" } : { background: "#fff0e0", color: "#b26a00" }),
                }}
              >
                {isTarget ? "TARGET" : "RACE"}
              </span>
            </div>

            <div style={{ marginTop: 14, height: 10, borderRadius: 6, background: "var(--offwhite)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", borderRadius: 6, width: `${Math.max(3, pct)}%`, background: won ? "#17C964" : "linear-gradient(90deg,#22C4DE,#4AD6EC)" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
              <span style={{ fontWeight: 700 }}>
                You: {fmt(p.metric, p.mine || 0)} {METRIC_LABEL[p.metric]}
              </span>
              <span style={{ fontWeight: 300, color: "var(--slate)" }}>
                {isTarget
                  ? `Goal: ${fmt(p.metric, p.target)}`
                  : p.leaderName
                  ? p.leading
                    ? "You're in the lead!"
                    : `#${p.myRank} · leader ${p.leaderName}: ${fmt(p.metric, p.leaderValue)}`
                  : "No entries yet — be first"}
              </span>
            </div>

            {won && (
              <span style={{ display: "inline-block", fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#17C964", color: "#fff", marginTop: 12 }}>
                {isTarget ? "Earned! 🎉" : "Leading 🏆"}
              </span>
            )}
          </div>
        );
      })}
    </Shell>
  );
}
