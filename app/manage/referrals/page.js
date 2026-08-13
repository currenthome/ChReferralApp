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

function Card({ r, onAction, onDelete, busy }) {
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
          <div className="rmeta">
            {r.dept} · referred by {r.referrerName}
            {r.teamView ? ` · ${r.points} pts earned` : ""}
          </div>
        </div>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="contactrow">
        <CallChip label="CANDIDATE" phone={r.candidatePhone} />
        <CallChip label="REFERRER" name={r.referrerName} phone={r.referrerPhone} />
        {r.resumeUrl && (
          <a className="callchip" href={r.resumeUrl} target="_blank" rel="noopener">
            <span className="cc">
              <span className="ccl">RESUME</span>
              <span className="ccn">{r.resumeName || "View resume"} ›</span>
            </span>
          </a>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "10px 0 2px" }}>
        <span style={{
          fontWeight: 700, fontSize: 9.5, letterSpacing: 1, padding: "4px 9px", borderRadius: 999,
          ...(r.lead === "recruiting" ? { background: "#efe9ff", color: "#5b3fbf" } : { background: "var(--cyanlight)", color: "#0a7d8f" }),
        }}>
          {r.lead === "recruiting" ? "RECRUITING-LED" : "MANAGER-LED"}
        </span>
        {r.teamView && (
          <span style={{ fontWeight: 700, fontSize: 9.5, letterSpacing: 1, padding: "4px 9px", borderRadius: 999, background: "#eceef2", color: "var(--slate)" }}>
            YOUR TEAM — VIEW ONLY
          </span>
        )}
        {r.ownerName ? (
          <span style={{ fontWeight: 300, fontSize: 12, color: "var(--slate)" }}>
            Worked by <b style={{ fontWeight: 700, color: "var(--charcoal)" }}>{r.ownerName}</b>
          </span>
        ) : (
          !r.teamView && !r.out && r.stage < HIRED_STAGE && (
            <button
              onClick={() => onAction(r, "claim")}
              disabled={busy}
              style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--cyan)", background: "var(--cyanlight)", color: "#0a7d8f", cursor: "pointer" }}
            >
              Assign to me
            </button>
          )
        )}
      </div>

      <div className="stepper" style={{ marginTop: 10 }}>
        {STAGES.map((s, i) => (
          <div key={s} className={`seg${i <= r.stage ? (r.out ? " out" : r.stage === HIRED_STAGE ? " hired" : " on") : ""}`} />
        ))}
      </div>

      <div className={`timerrow ${timerCls}`}>
        <b>{inStage}d</b> in stage · <b>{since}d</b> since submitted
      </div>

      {!r.teamView && !r.out && r.stage < HIRED_STAGE && (
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
          <button className="mlink" disabled={busy} onClick={() => onAction(r, "setLead", { lead: r.lead === "recruiting" ? "manager" : "recruiting" })}>
            {r.lead === "recruiting" ? "Jump in — I'll take the lead" : "Hand to recruiting"}
          </button>
        </>
      )}

      {!r.teamView && !r.out && r.stage === HIRED_STAGE && (
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

      {!r.teamView && r.out && (
        <button className="mlink" disabled={busy} onClick={() => onAction(r, "reopen")}>
          Reopen at “{STAGES[r.stage]}”
        </button>
      )}

      {!r.teamView && (
        <button className="mlink" style={{ color: "#c0392b" }} disabled={busy} onClick={() => onDelete(r)}>
          Delete submission
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

  async function onDelete(r) {
    const ok = window.confirm(
      `Delete ${r.candidateName}'s submission? This also removes any points it earned. It can't be undone.`
    );
    if (!ok) return;
    setBusy(true);
    setToast("");
    try {
      const res = await api(`/api/manage/referrals/${r.id}`, { method: "DELETE" });
      setToast(res.message || "Deleted.");
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
    if (filter === "team") return r.teamView;
    return true;
  });

  return (
    <Shell wide nav={false}>
      <ManagerGuard>
        <h1>Update referrals</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Move candidates through the funnel. Each change updates the referrer and awards points automatically.
          Referrals your team sent to other departments show here too — view-only, with the points they've earned.
        </p>
        {toast && <div className="toast">{toast}</div>}
        <div className="sortbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="open">In progress</option>
            <option value="hired">Hired</option>
            <option value="out">Not moving forward</option>
            <option value="team">My team's referrals (view-only)</option>
          </select>
        </div>
        {!data && <div className="spinner">Loading…</div>}
        {data && refs.length === 0 && <p className="note" style={{ textAlign: "left" }}>Nothing here yet.</p>}
        <div className="cardgrid">
          {refs.map((r) => (
            <Card key={r.id} r={r} onAction={onAction} onDelete={onDelete} busy={busy} />
          ))}
        </div>
      </ManagerGuard>
    </Shell>
  );
}
