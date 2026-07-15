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

  useEffect(() => {
    api("/api/manage/scoring").then((d) => setScoring(d.scoring)).catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setToast("");
    try {
      const res = await api("/api/manage/scoring", { method: "POST", body: scoring });
      setScoring(res.scoring);
      setToast("Scoring updated. Changes apply going forward.");
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell nav={false}>
      <ManagerGuard>
        <h1>Scoring & milestones</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Points for each milestone. Changes apply going forward and every change is logged.
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
                <input
                  type="number"
                  value={scoring[key].pts}
                  onChange={(e) => setScoring({ ...scoring, [key]: { ...scoring[key], pts: e.target.value } })}
                />
              </div>
            </div>
          ))}
        {scoring && (
          <button className="btn" style={{ marginTop: 10 }} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </ManagerGuard>
    </Shell>
  );
}
