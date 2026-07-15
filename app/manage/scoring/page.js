"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";

const DETAILS = {
  submit: "When a referral is submitted",
  start: "When the hire's first day arrives",
  day30: "30 days after start",
};

export default function Scoring() {
  const [scoring, setScoring] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ name: "", days: "", pts: "", cash: "" });

  useEffect(() => {
    api("/api/manage/scoring").then((d) => setScoring({ custom: [], ...d.scoring })).catch(() => {});
  }, []);

  async function save(next) {
    setBusy(true);
    setToast("");
    try {
      const res = await api("/api/manage/scoring", { method: "POST", body: next });
      setScoring({ custom: [], ...res.scoring });
      setToast("Scoring updated. Changes apply going forward.");
      return true;
    } catch (e) {
      setToast(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addMilestone() {
    const next = { ...scoring, custom: [...(scoring.custom || []), add] };
    if (await save(next)) {
      setAdd({ name: "", days: "", pts: "", cash: "" });
      setShowAdd(false);
    }
  }

  function removeMilestone(id) {
    save({ ...scoring, custom: (scoring.custom || []).filter((m) => m.id !== id) });
  }

  const setBase = (key, field, value) =>
    setScoring({ ...scoring, [key]: { ...scoring[key], [field]: value } });
  const setCustom = (id, field, value) =>
    setScoring({ ...scoring, custom: scoring.custom.map((m) => (m.id === id ? { ...m, [field]: value } : m)) });

  return (
    <Shell nav={false}>
      <ManagerGuard>
        <h1>Scoring & milestones</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Points and cash payout for each milestone. Cash of $0 means points only. Changes apply going forward and every change is logged.
        </p>
        {toast && <div className="toast">{toast}</div>}
        {!scoring && <div className="spinner">Loading…</div>}

        {scoring &&
          ["submit", "start", "day30"].map((key) => (
            <div key={key} className="milecard">
              <div className="mn">
                <div className="t">{scoring[key].label}</div>
                <div className="d">{DETAILS[key]}</div>
              </div>
              <div className="mfield">
                <span className="mflbl">PTS</span>
                <input type="number" value={scoring[key].pts} onChange={(e) => setBase(key, "pts", e.target.value)} />
              </div>
              <div className="mfield">
                <span className="mflbl">CASH $</span>
                <input type="number" value={scoring[key].cash ?? 0} onChange={(e) => setBase(key, "cash", e.target.value)} />
              </div>
            </div>
          ))}

        {scoring?.custom?.map((m) => (
          <div key={m.id} className="milecard">
            <div className="mn">
              <div className="t">{m.name}</div>
              <div className="d">{m.days} days after start</div>
            </div>
            <div className="mfield">
              <span className="mflbl">PTS</span>
              <input type="number" value={m.pts} onChange={(e) => setCustom(m.id, "pts", e.target.value)} />
            </div>
            <div className="mfield">
              <span className="mflbl">CASH $</span>
              <input type="number" value={m.cash ?? 0} onChange={(e) => setCustom(m.id, "cash", e.target.value)} />
            </div>
            <button className="del" style={{ background: "none", border: "none", color: "var(--err)", fontSize: 22, lineHeight: 1, cursor: "pointer", fontWeight: 700, padding: "0 2px", flex: "none" }} disabled={busy} onClick={() => removeMilestone(m.id)} aria-label={`Delete ${m.name}`}>
              ×
            </button>
          </div>
        ))}

        {scoring && !showAdd && (
          <button className="inviteopen" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>+ Add milestone</button>
        )}
        {showAdd && (
          <div className="invitebox">
            <h3>Add milestone</h3>
            <div className="field"><label>Name</label>
              <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="e.g. Day 90" /></div>
            <div className="field"><label>Days from start</label>
              <input type="number" value={add.days} onChange={(e) => setAdd({ ...add, days: e.target.value })} placeholder="90" /></div>
            <div className="field"><label>Points</label>
              <input type="number" value={add.pts} onChange={(e) => setAdd({ ...add, pts: e.target.value })} placeholder="150" /></div>
            <div className="field"><label>Cash payout ($)</label>
              <input type="number" value={add.cash} onChange={(e) => setAdd({ ...add, cash: e.target.value })} placeholder="0" /></div>
            <button className="btn" disabled={busy} onClick={addMilestone}>Add</button>
            <button className="mlink" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        )}

        {scoring && (
          <button className="btn" style={{ marginTop: 10 }} onClick={() => save(scoring)} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
        <button className="btnghost" style={{ width: "100%", marginTop: 12 }} onClick={() => history.back()}>Back</button>
      </ManagerGuard>
    </Shell>
  );
}
