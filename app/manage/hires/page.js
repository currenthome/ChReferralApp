"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";

function HireCard({ h, busy, onAction }) {
  const [term, setTerm] = useState(h.terminationDate || "");

  return (
    <div className="mcard">
      <div className="rtop">
        <div>
          <div className="rname">{h.candidateName}</div>
          <div className="rmeta">
            {h.dept} · referred by {h.referrerName} · starts {h.startDate || "(no date set)"}
          </div>
        </div>
        <span className={`badge ${h.terminationDate ? "out" : "green"}`}>
          {h.terminationDate ? "Terminated" : "Active"}
        </span>
      </div>

      <div style={{ fontWeight: 300, fontSize: 12, color: "var(--slate)", marginTop: 8 }}>
        Start points: {h.startAwarded ? "awarded" : "pending"} · Day 30: {h.day30Awarded ? "awarded" : "pending"}
      </div>

      <div className="startrow">
        <label>Termination date {h.terminationDate ? "" : "— set only if they leave"}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={term} onChange={(e) => setTerm(e.target.value)} />
          <button className="btnghost" style={{ flex: "none" }} disabled={busy || !term} onClick={() => onAction({ action: "setTermination", id: h.id, date: term })}>
            Save
          </button>
        </div>
        {h.terminationDate && (
          <button className="mlink" disabled={busy} onClick={() => { setTerm(""); onAction({ action: "clearTermination", id: h.id }); }}>
            Clear termination (rehired / mistake)
          </button>
        )}
        <p className="note" style={{ textAlign: "left", marginTop: 8 }}>
          Milestones after this date won't award — points and cash already earned stay.
        </p>
      </div>
    </div>
  );
}

export default function Hires() {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmFreeze, setConfirmFreeze] = useState(false);

  const load = () => api("/api/manage/hires").then(setData).catch(() => setData({ hires: [], frozen: [] }));
  useEffect(() => { load(); }, []);

  async function onAction(body) {
    setBusy(true);
    setToast("");
    try {
      const res = await api("/api/manage/hires", { method: "POST", body });
      setToast(res.message || "Done.");
      setConfirmFreeze(false);
      await load();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell nav={false}>
      <ManagerGuard>
        <h1>Hires & month-end</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Keep employment statuses accurate, then freeze the month to lock its standings.
        </p>
        {toast && <div className="toast">{toast}</div>}

        {!data && <div className="spinner">Loading…</div>}
        {data && data.hires.length === 0 && <p className="note" style={{ textAlign: "left" }}>No hires yet.</p>}

        {data?.hires.map((h) => (
          <HireCard key={h.id} h={h} busy={busy} onAction={onAction} />
        ))}

        {data && (
          <div style={{ marginTop: 24 }}>
            {!confirmFreeze ? (
              <button className="btn" disabled={busy || data.frozen.includes(data.currentMonth)} onClick={() => setConfirmFreeze(true)}>
                {data.frozen.includes(data.currentMonth) ? `${data.currentMonth} is frozen` : `Freeze ${data.currentMonth}`}
              </button>
            ) : (
              <div className="invitebox">
                <h3>Freeze {data.currentMonth}?</h3>
                <p className="sub" style={{ marginBottom: 14 }}>
                  This locks the month's standings into a permanent snapshot. Points that land later roll into the next open month. This can't be undone.
                </p>
                <button className="btn" disabled={busy} onClick={() => onAction({ action: "freezeMonth" })}>
                  Yes, freeze it
                </button>
                <button className="mlink" onClick={() => setConfirmFreeze(false)}>Cancel</button>
              </div>
            )}
            {data.frozen.length > 0 && (
              <p className="note">Frozen months: {data.frozen.join(", ")}</p>
            )}
          </div>
        )}
        <button className="btnghost" style={{ width: "100%", marginTop: 16 }} onClick={() => history.back()}>Back</button>
      </ManagerGuard>
    </Shell>
  );
}
