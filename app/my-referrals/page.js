"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/firebaseClient";
import { STAGES, HIRED_STAGE } from "@/lib/constants";

function Stepper({ stage, out }) {
  return (
    <div className="stepper">
      {STAGES.map((s, i) => (
        <div
          key={s}
          className={`seg${i <= stage ? (out ? " out" : stage === HIRED_STAGE ? " hired" : " on") : ""}`}
        />
      ))}
    </div>
  );
}

function badge(r) {
  if (r.out) return { cls: "out", label: "Not moving forward" };
  if (r.stage === HIRED_STAGE) return { cls: "green", label: "Hired 🎉" };
  return { cls: "cyan", label: STAGES[r.stage] };
}

export default function MyReferrals() {
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    api("/api/referrals").then(setData).catch(() => setData({ referrals: [], totalPoints: 0 }));
  }, []);

  if (!data) return <Shell><div className="spinner">Loading…</div></Shell>;

  const refs = [...data.referrals].sort((a, b) => {
    if (sort === "furthest") return b.stage - a.stage;
    if (sort === "points") return b.points - a.points;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  const hired = refs.filter((r) => r.stage === HIRED_STAGE && !r.out).length;

  return (
    <Shell>
      <h1>My referrals</h1>
      <p className="sub" style={{ marginBottom: 20 }}>Everyone you've referred, and where they are in the process.</p>

      <div className="summary">
        <div className="stat"><div className="sv">{refs.length}</div><div className="sl">Referred</div></div>
        <div className="stat"><div className="sv">{hired}</div><div className="sl">Hired</div></div>
        <div className="stat"><div className="sv">{data.totalPoints}</div><div className="sl">Points</div></div>
      </div>

      <div className="sortbar">
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="furthest">Furthest in funnel</option>
          <option value="points">Most points</option>
        </select>
      </div>

      {refs.length === 0 && (
        <p className="note" style={{ textAlign: "left" }}>
          No referrals yet — know someone great? Submit them from the Home screen.
        </p>
      )}

      {refs.map((r) => {
        const b = badge(r);
        const open = openId === r.id;
        return (
          <div key={r.id} className="rcard" onClick={() => setOpenId(open ? null : r.id)}>
            <div className="rtop">
              <div>
                <div className="rname">{r.candidateName}</div>
                <div className="rmeta">{r.dept} · {new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="rpts"><span className="n">{r.points}</span> <span className="u">pts</span></div>
            </div>
            <span className={`badge ${b.cls}`}>{b.label}</span>
            <Stepper stage={r.stage} out={r.out} />
            {open && (
              <div className="timeline">
                {r.timeline.map((t, i) => (
                  <div key={i} className={`tlrow${t.stage === "Not moving forward" ? " out" : ""}`}>
                    <span className="ts">{t.stage}</span>
                    <span className="td">{new Date(t.at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Shell>
  );
}
