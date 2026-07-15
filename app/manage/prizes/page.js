"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";

const EMPTY = { reward: "", type: "Race", metric: "hires", target: "", deadline: "", dept: "" };

export default function ManagePrizes() {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = () => api("/api/manage/prizes").then(setData).catch(() => setData({ prizes: [] }));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (data && !data.seesAll) setForm((f) => ({ ...f, dept: data.myDept || "" }));
  }, [data]);

  async function act(body, after) {
    setBusy(true);
    setToast("");
    try {
      const res = await api("/api/manage/prizes", { method: "POST", body });
      setToast(res.message || "Done.");
      if (after) after();
      await load();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const grouped = {};
  (data?.prizes || []).forEach((p) => {
    (grouped[p.dept] = grouped[p.dept] || []).push(p);
  });

  return (
    <Shell nav={false}>
      <ManagerGuard>
        <h1>Prizes & goals</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Create rewards your team can chase. A <b>Race</b> rewards the top performer by the deadline; a <b>Target</b> rewards everyone who hits the goal in time.
          {data && !data.seesAll ? ` You manage ${data.myDept || "your department"}'s prizes.` : " Recruiting manages all departments."}
        </p>
        {toast && <div className="toast">{toast}</div>}

        <button className="inviteopen" onClick={() => setShow(!show)}>+ Create prize</button>
        {show && (
          <div className="invitebox">
            <h3>Create prize</h3>
            <div className="field"><label>Reward</label>
              <input value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} placeholder="e.g. Weekend in Napa for two" /></div>
            <div className="field"><label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>Race</option><option>Target</option>
              </select></div>
            <div className="field"><label>Measured in</label>
              <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                <option value="hires">Hires</option>
                <option value="points">Points</option>
                <option value="referrals">Referrals</option>
                <option value="cash">Cash earned</option>
              </select></div>
            {form.type === "Target" && (
              <div className="field"><label>Goal to reach</label>
                <input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="e.g. 5" /></div>
            )}
            <div className="field"><label>Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
            <div className="field"><label>Who can see it</label>
              <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} disabled={data && !data.seesAll}>
                <option value="">Select…</option>
                {data?.seesAll && <option>Company-wide</option>}
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select></div>
            <button className="btn" disabled={busy} onClick={() => act(form, () => { setForm(data?.seesAll ? EMPTY : { ...EMPTY, dept: data.myDept }); setShow(false); })}>
              Create prize
            </button>
            <button className="mlink" onClick={() => setShow(false)}>Cancel</button>
          </div>
        )}

        {!data && <div className="spinner">Loading…</div>}
        {data && data.prizes.length === 0 && <p className="note" style={{ textAlign: "left" }}>No prizes yet.</p>}

        {Object.entries(grouped).map(([dept, prizes]) => (
          <div key={dept}>
            <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1.5, color: "var(--slate)", margin: "20px 0 10px" }}>{dept.toUpperCase()}</div>
            {prizes.map((p) => (
              <div key={p.id} className="mcard">
                <div className="rtop">
                  <div>
                    <div className="rname">{p.reward}</div>
                    <div className="rmeta">
                      {p.type} · {p.metric}{p.type === "Target" ? ` · goal ${p.target}` : ""} · ends {p.deadline} · set by {p.createdByName}
                    </div>
                  </div>
                  {p.canManage && (
                    <button className="mlink" style={{ width: "auto", marginTop: 0, color: "var(--err)" }} disabled={busy} onClick={() => act({ action: "delete", id: p.id })}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </ManagerGuard>
    </Shell>
  );
}
