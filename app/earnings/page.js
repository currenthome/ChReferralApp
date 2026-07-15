"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/firebaseClient";
import { STAGES } from "@/lib/constants";

const money = (n) => `$${Number(n).toLocaleString()}`;

export default function Earnings() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api("/api/earnings").then(setData).catch(() => setData({ earned: 0, pipeline: 0, referrals: [] }));
  }, []);

  if (!data) return <Shell><div className="spinner">Loading…</div></Shell>;

  const withPayouts = data.referrals.filter((r) => r.payouts.length > 0);

  return (
    <Shell>
      <h1>My earnings</h1>
      <p className="sub" style={{ marginBottom: 18 }}>Cash you've banked, and what's still in your pipeline.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, borderRadius: 16, padding: "18px 12px", textAlign: "center", background: "#e5f7ea", border: "1px solid #9adcb0" }}>
          <div style={{ fontWeight: 700, fontSize: 26, color: "#1e7d34" }}>{money(data.earned)}</div>
          <div style={{ fontWeight: 300, fontSize: 11.5, color: "var(--slate)", marginTop: 3 }}>Earned</div>
        </div>
        <div style={{ flex: 1, borderRadius: 16, padding: "18px 12px", textAlign: "center", background: "var(--cyanlight)", border: "1px solid var(--cyan)" }}>
          <div style={{ fontWeight: 700, fontSize: 26, color: "#0a7d8f" }}>{money(data.pipeline)}</div>
          <div style={{ fontWeight: 300, fontSize: 11.5, color: "var(--slate)", marginTop: 3 }}>In pipeline</div>
        </div>
      </div>

      {withPayouts.length === 0 && (
        <p className="note" style={{ textAlign: "left" }}>
          No cash payouts are configured right now — when your managers attach dollar amounts to milestones, your referrals' payouts will show here automatically.
        </p>
      )}

      {withPayouts.map((r) => (
        <div key={r.id} className="mcard">
          <div className="rtop">
            <div>
              <div className="rname">{r.candidateName}</div>
              <div className="rmeta">
                {r.dept} · {r.out ? "Not moving forward" : r.terminated ? "No longer employed" : r.hired ? "Hired" : STAGES[r.stage]}
              </div>
            </div>
          </div>
          {r.payouts.map((p) => (
            <div key={p.milestone} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 13 }}>
              <span style={{ fontWeight: 500, ...(p.state === "void" ? { color: "#b8bcc6", textDecoration: "line-through" } : {}) }}>
                {p.label}
              </span>
              <span style={{ fontWeight: 700, color: p.state === "earned" ? "#1e7d34" : p.state === "void" ? "#b8bcc6" : "var(--slate)", ...(p.state === "void" ? { textDecoration: "line-through" } : {}) }}>
                {money(p.cash)}{p.state === "pending" ? " · pending" : p.state === "earned" ? " · earned" : ""}
              </span>
            </div>
          ))}
        </div>
      ))}

      <p className="note">
        Pipeline unlocks as your referrals get hired and reach each payout milestone. If someone leaves before a milestone, that payout is voided — but anything already earned is yours.
      </p>
    </Shell>
  );
}
