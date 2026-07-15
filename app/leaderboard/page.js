"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/firebaseClient";

export default function Leaderboard() {
  const [range, setRange] = useState("month");
  const [scope, setScope] = useState("dept");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/api/leaderboard?range=${range}&scope=${scope}`)
      .then(setData)
      .catch(() => setData({ rows: [] }));
  }, [range, scope]);

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
        Showing <b>{data?.scope || "…"}</b> · {range === "month" ? "This month" : "All-time"}
      </p>
      <div className="ctrls">
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="month">This month</option>
          <option value="all">All-time</option>
        </select>
      </div>
      <div className="ctrls">
        <button className={`pill${scope === "dept" ? " active" : ""}`} onClick={() => setScope("dept")}>My department</button>
        <button className={`pill${scope === "company" ? " active" : ""}`} onClick={() => setScope("company")}>Company-wide</button>
      </div>

      {!data && <div className="spinner">Loading…</div>}
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
