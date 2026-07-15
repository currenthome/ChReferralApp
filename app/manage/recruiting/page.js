"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";
import { STAGES, HIRED_STAGE, phoneKey } from "@/lib/constants";

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// First-contact queue: recruiting-led referrals still in the pipeline.
export default function RecruitingQueue() {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api("/api/manage/referrals?scope=company").then(setData).catch(() => setData({ referrals: [] }));
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

  const queue = (data?.referrals || []).filter((r) => r.lead === "recruiting" && !r.out && r.stage < HIRED_STAGE);

  return (
    <Shell wide nav={false}>
      <ManagerGuard>
        <h1>Recruiting queue</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Referrals routed to recruiting for first contact. Pre-screen these, then hand strong ones to the hiring manager.
        </p>
        {toast && <div className="toast">{toast}</div>}
        <div style={{ background: "var(--cyanlight)", border: "1px solid var(--cyan)", borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontWeight: 300, fontSize: 13, color: "var(--slate)" }}>
          <b style={{ fontWeight: 700, color: "var(--charcoal)" }}>{queue.length}</b> waiting for first contact.
        </div>

        {!data && <div className="spinner">Loading…</div>}
        {data && queue.length === 0 && <p className="note" style={{ textAlign: "left" }}>Queue is clear. 🎉</p>}

        <div className="cardgrid">
          {queue.map((r) => {
            const inStage = daysSince(r.stageChangedAt);
            const timerCls = inStage >= 7 ? "late" : inStage >= 3 ? "warn" : "ok";
            return (
              <div key={r.id} className="mcard">
                <div className="rtop">
                  <div>
                    <div className="rname">{r.candidateName}</div>
                    <div className="rmeta">{r.dept} · referred by {r.referrerName}{r.source === "self-apply" ? " (self-applied)" : ""}</div>
                  </div>
                  <span className="badge cyan">{STAGES[r.stage]}</span>
                </div>

                <div className="contactrow">
                  <a className="callchip" href={`tel:${phoneKey(r.candidatePhone)}`}>
                    <span className="cc">
                      <span className="ccl">CANDIDATE</span>
                      <span className="ccn">{r.candidatePhone}</span>
                    </span>
                  </a>
                  {r.resumeUrl && (
                    <a className="callchip" href={r.resumeUrl} target="_blank" rel="noopener">
                      <span className="cc">
                        <span className="ccl">RESUME</span>
                        <span className="ccn">{r.resumeName || "View resume"} ›</span>
                      </span>
                    </a>
                  )}
                </div>

                <div className="stepper" style={{ marginTop: 10 }}>
                  {STAGES.map((s, i) => (
                    <div key={s} className={`seg${i <= r.stage ? " on" : ""}`} />
                  ))}
                </div>

                <div className={`timerrow ${timerCls}`}>
                  <b>{inStage}d</b> in stage · <b>{daysSince(r.createdAt)}d</b> since submitted
                </div>

                <button className="btn" style={{ marginTop: 14, padding: 13 }} disabled={busy} onClick={() => onAction(r, "advance")}>
                  Advance to “{STAGES[r.stage + 1]}”
                </button>
                <button className="mlink" disabled={busy} onClick={() => onAction(r, "setLead", { lead: "manager" })}>
                  Hand off to manager
                </button>
                <button className="mlink" disabled={busy} onClick={() => onAction(r, "out")}>
                  Mark not moving forward
                </button>
              </div>
            );
          })}
        </div>
        <button className="btnghost" style={{ width: "100%", marginTop: 16 }} onClick={() => history.back()}>Back</button>
      </ManagerGuard>
    </Shell>
  );
}
