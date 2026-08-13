"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";

export default function Report() {
  const [days, setDays] = useState(30);
  const [dept, setDept] = useState("Company");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/api/manage/report?days=${days}&dept=${encodeURIComponent(dept)}`)
      .then(setData)
      .catch(() => setData({ headline: {}, funnel: [], conversions: [], reps: [] }));
  }, [days, dept]);

  const top = data?.funnel?.[0]?.count || 0;
  const cards = data
    ? [
        { label: "Referrals submitted", value: data.headline.submitted },
        { label: "Hires from referrals", value: data.headline.hires },
        { label: "Submit → hire", value: `${data.headline.conversion}%` },
        { label: "Still in pipeline", value: data.headline.inPipeline },
      ]
    : [];

  return (
    <Shell wide nav={false}>
      <ManagerGuard>
        <h1>Reporting</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Referral program performance — funnel, conversions, hires, and rep quality.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto", padding: "8px 10px", fontSize: 13 }}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
            <option value={0}>All time</option>
          </select>
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: "auto", padding: "8px 10px", fontSize: 13 }}>
            <option value="Company">Company-wide</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>

        {!data && <div className="spinner">Loading…</div>}

        {data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 8 }}>
              {cards.map((c) => (
                <div key={c.label} style={{ background: "#fff", border: "1px solid var(--gray)", borderRadius: 14, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: 1, color: "var(--slate)", textTransform: "uppercase", marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 26, color: "var(--charcoal)", lineHeight: 1 }}>{c.value ?? 0}</div>
                </div>
              ))}
            </div>
            {data.headline.selfApplied > 0 && (
              <p className="note" style={{ textAlign: "left", marginBottom: 0 }}>
                {data.headline.selfApplied} came in through share links / QR codes.
              </p>
            )}

            <h3 className="rsec" style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--slate)", margin: "24px 0 12px" }}>Hiring funnel</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.funnel.map((f, i) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 110, flex: "none", fontWeight: 500, fontSize: 12 }}>{f.label}</div>
                  <div style={{ flex: 1, background: "var(--offwhite)", border: "1px solid var(--gray)", borderRadius: 8, overflow: "hidden", height: 30 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${top ? Math.max(4, (f.count / top) * 100) : 4}%`,
                        background: i === data.funnel.length - 1 ? "#17C964" : "var(--cyan)",
                        display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 10,
                        fontWeight: 700, fontSize: 12, color: "var(--charcoal)", minWidth: 30, boxSizing: "border-box",
                      }}
                    >
                      {f.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--slate)", margin: "24px 0 12px" }}>Stage-to-stage conversion</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {data.conversions.map((c) => (
                <div key={c.label} style={{ background: "#fff", border: "1px solid var(--gray)", borderRadius: 10, padding: "9px 12px", fontWeight: 300, fontSize: 12, color: "var(--slate)" }}>
                  {c.label} <b style={{ fontWeight: 700, color: "var(--charcoal)", marginLeft: 2 }}>{c.pct}%</b>
                </div>
              ))}
            </div>

            <h3 style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--slate)", margin: "24px 0 12px" }}>Rep performance</h3>
            <div style={{ overflowX: "auto", border: "1px solid var(--gray)", borderRadius: 14, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Rep", "Referrals", "Hires", "Still active", "Conversion"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "11px 12px", borderBottom: "1px solid var(--gray)", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.5, color: "var(--slate)", textTransform: "uppercase", background: "var(--offwhite)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.reps.map((r) => (
                    <tr key={r.name}>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", fontWeight: 700, whiteSpace: "nowrap" }}>{r.name}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)" }}>{r.refs}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)" }}>{r.hires}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)" }}>{r.active}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", fontWeight: 700, color: r.conversion >= 20 ? "#1e7d34" : r.conversion > 0 ? "#b26a00" : "var(--slate)" }}>{r.conversion}%</td>
                    </tr>
                  ))}
                  {data.reps.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: "16px 12px", fontWeight: 300, color: "var(--slate)" }}>No referrals in this range yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button className="btnghost" style={{ width: "100%", marginTop: 20 }} onClick={() => history.back()}>Back</button>
      </ManagerGuard>
    </Shell>
  );
}
