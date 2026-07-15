"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/firebaseClient";

const RANGE_LABEL = { month: "This month", ytd: "Year-to-date", all: "All-time", custom: "Custom range" };

export default function Leaderboard() {
  const [range, setRange] = useState("month");
  const [scope, setScope] = useState("dept");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (range === "custom" && (!from || !to)) return;
    setData(null);
    const extra = range === "custom" ? `&from=${from}&to=${to}` : "";
    api(`/api/leaderboard?range=${range}&scope=${scope}${extra}`)
      .then(setData)
      .catch(() => setData({ rows: [] }));
  }, [range, scope, from, to]);

  const rows = data?.rows || [];
  const top = rows[0]?.points || 0;

  function exportCSV() {
    const head = "Rank,Name,Department,Points,Referrals,Hires,Conversion\n";
    const lines = rows
      .map((r) =>
        [r.rank, r.name, r.dept, r.points, r.refs, r.hires, r.refs ? Math.round((r.hires / r.refs) * 100) + "%" : "0%"].join(",")
      )
      .join("\n");
    const blob = new Blob([head + lines], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leaderboard-${range}-${scope}.csv`;
    a.click();
  }

  return (
    <Shell>
      <h1>Leaderboard</h1>
      <p className="subline">
        Showing <b>{data?.scope || "…"}</b> · {RANGE_LABEL[range]}
      </p>
      <div className="ctrls">
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="month">This month</option>
          <option value="ytd">Year-to-date</option>
          <option value="all">All-time</option>
          <option value="custom">Custom range</option>
        </select>
      </div>
      {range === "custom" && (
        <div className="ctrls">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ flex: 1 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}
      <div className="ctrls">
        <button className={`pill${scope === "dept" ? " active" : ""}`} onClick={() => setScope("dept")}>My department</button>
        <button className={`pill${scope === "company" ? " active" : ""}`} onClick={() => setScope("company")}>Company-wide</button>
      </div>

      {data?.banner && (
        <div style={{ background: "var(--cyanlight)", border: "1px solid var(--cyan)", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
          <div style={{ fontWeight: 500, fontSize: 9.5, letterSpacing: 1, color: "#0a9db3", marginBottom: 5 }}>
            {data.banner.dept.toUpperCase()} CHALLENGE · ENDS {data.banner.deadline}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--charcoal)" }}>{data.banner.reward}</div>
          <div style={{ fontWeight: 300, fontSize: 12.5, color: "var(--slate)", marginTop: 3, lineHeight: 1.4 }}>
            {data.banner.type === "Race"
              ? `Top ${data.banner.metric} by the deadline wins.`
              : `Hit ${data.banner.target} ${data.banner.metric} to earn it.`} Set by {data.banner.by} — see Prizes & goals for progress.
          </div>
        </div>
      )}

      {!data && range === "custom" && (!from || !to) && <p className="note" style={{ textAlign: "left" }}>Pick both dates.</p>}
      {!data && !(range === "custom" && (!from || !to)) && <div className="spinner">Loading…</div>}
      {data && rows.length === 0 && <p className="note" style={{ textAlign: "left" }}>No points yet — be the first on the board.</p>}

      {rows.map((r) => (
        <div key={r.uid} className={`lbrow${r.you ? " you" : ""}`}>
          <div className={`lbrank${r.rank <= 3 ? " top" : ""}`}>{r.rank}</div>
          <div className="lbmid">
            <div className="lbname">{r.you ? `${r.name} (you)` : r.name}</div>
            <div className="lbstats">
              {r.refs} referrals · {r.hires} hires · {r.refs ? Math.round((r.hires / r.refs) * 100) : 0}% conversion
            </div>
            <div className="lbbar">
              <span className="f" style={{ width: `${top ? Math.max(3, (r.points / top) * 100) : 3}%` }} />
            </div>
          </div>
          <div className="lbpts"><span className="n">{r.points}</span> <span className="u">pts</span></div>
        </div>
      ))}

      {rows.length > 0 && <button className="export" onClick={exportCSV}>Export CSV</button>}
      <p className="note">Ranked by points. Ties break by hires, then who reached the score first.</p>
    </Shell>
  );
}
