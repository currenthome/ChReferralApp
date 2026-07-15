"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";
import { STAGES, HIRED_STAGE, phoneKey } from "@/lib/constants";

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function CallChip({ label, name, phone }) {
  if (!phone) return null;
  return (
    <a className="callchip" href={`tel:${phoneKey(phone)}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0DCCE8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      <span className="cc">
        <span className="ccl">{label}</span>
        <span className="ccn">{name ? `${name} · ${phone}` : phone}</span>
      </span>
    </a>
  );
}

function Card({ r, onAction, busy }) {
  const [startDate, setStartDate] = useState(r.startDate || "");
  const inStage = daysSince(r.stageChangedAt);
  const since = daysSince(r.createdAt);
  const timerCls = r.out || r.stage === HIRED_STAGE ? "ok" : inStage >= 7 ? "late" : inStage >= 3 ? "warn" : "ok";
  const badge = r.out
    ? { cls: "out", label: "Not moving forward" }
    : r.stage === HIRED_STAGE
    ? { cls: "green", label: "Hired" }
    : { cls: "cyan", label: STAGES[r.stage] };

  return (
    <div className="mcard">
      <div className="rtop">
        <div>
          <div className="rname">{r.candidateName}</div>
          <div className="rmeta">{r.dept} · referred by {r.referrerName}</div>
        </div>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="contactrow">
        <CallChip label="CANDIDATE" phone={r.candidatePhone} />
      </div>

      <div className="stepper" style={{ marginTop: 10 }}>
        {STAGES.map((s, i) => (
          <div key={s} className={`seg${i <= r.stage ? (r.out ? " out" : r.stage === HIRED_STAGE ? " hired" : " on") : ""}`} />
        ))}
      </div>

      <div className={`timerrow ${timerCls}`}>
        <b>{inStage}d</b> in stage · <b>{since}d</b> since submitted
      </div>

      {!r.out && r.stage < HIRED_STAGE && (
        <>
          <button className="btn" style={{ marginTop: 14, padding: 13 }} disabled={busy} onClick={() => onAction(r, "advance")}>
            Advance to “{STAGES[r.stage + 1]}”
          </button>
          {r.stage > 0 && (
            <button className="mlink" disabled={busy} onClick={() => onAction(r, "back")}>
              ← Move back to “{STAGES[r.stage - 1]}”
            </button>
          )}
          <button className="mlink" disabled={busy} onClick={() => onAction(r, "out")}>
            Mark not moving forward
          </button>
        </>
      )}

      {!r.out && r.stage === HIRED_STAGE && (
        <div className="startrow">
          <label>Start date {r.startDate ? "(set)" : "— points award from their first day"}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <button
              className="btnghost"
              style={{ flex: "none" }}
              disabled={busy || !startDate}
              onClick={() => onAction(r, "setStart", { startDate })}
            >
              Save
            </button>
          </div>
          <button className="mlink" disabled={busy} onClick={() => onAction(r, "back")}>
            ← Move back to “{STAGES[HIRED_STAGE - 1]}” (clears start date)
          </button>
        </div>
      )}

      {r.out && (
        <button className="mlink" disabled={busy} onClick={() => onAction(r, "reopen")}>
          Reopen at “{STAGES[r.stage]}”
        </button>
      )}
    </div>
  );
}

export default function ManageReferrals() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api("/api/manage/referrals").then(setData).catch(() => setData({ referrals: [] }));
  useEffect(() => { load(); }, []);

  async function onAction(r, action, extra = {}) {
    setBusy(true);
    setToast("");
    try {
      const res = await api(`/api/manage/referrals/${r.id}`, { method: "POST", body: { action, ...extra } });
      setToast(res.message || "Updated.");
      await load();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const refs = (data?.referrals || []).filter((r) => {
    if (filter === "open") return !r.out && r.stage < HIRED_STAGE;
    if (filter === "hired") return r.stage === HIRED_STAGE && !r.out;
    if (filter === "out") return r.out;
    return true;
  });

  return (
    <Shell wide nav={false}>
      <ManagerGuard>
        <h1>Update referrals</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Move candidates through the funnel. Each change updates the referrer and awards points automatically.
        </p>
        {toast && <div className="toast">{toast}</div>}
        <div className="sortbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="open">In progress</option>
            <option value="hired">Hired</option>
            <option value="out">Not moving forward</option>
          </select>
        </div>
        {!data && <div className="spinner">Loading…</div>}
        {data && refs.length === 0 && <p className="note" style={{ textAlign: "left" }}>Nothing here yet.</p>}
        <div className="cardgrid">
          {refs.map((r) => (
            <Card key={r.id} r={r} onAction={onAction} busy={busy} />
          ))}
        </div>
      </ManagerGuard>
    </Shell>
  );
}
