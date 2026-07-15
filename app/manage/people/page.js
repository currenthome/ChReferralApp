"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";

export default function People() {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inv, setInv] = useState({ name: "", email: "", phone: "", dept: "", role: "employee" });
  const [busy, setBusy] = useState(false);

  const load = () => api("/api/manage/people").then(setData).catch(() => setData({ people: [], invites: [] }));
  useEffect(() => { load(); }, []);

  async function act(body, after) {
    setBusy(true);
    setToast("");
    try {
      const res = await api("/api/manage/people", { method: "POST", body });
      setToast(res.message || "Done.");
      if (after) after();
      await load();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  function sendInvite() {
    if (!inv.email || !inv.dept) {
      setToast("Email and department are required.");
      return;
    }
    act({ action: "invite", ...inv }, () => {
      setInv({ name: "", email: "", phone: "", dept: "", role: "employee" });
      setShowInvite(false);
    });
  }

  return (
    <Shell nav={false}>
      <ManagerGuard>
        <h1>People</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Add teammates and manage their access. New people just sign in with their Current Home Google account.
        </p>
        {toast && <div className="toast">{toast}</div>}

        <button className="inviteopen" onClick={() => setShowInvite(!showInvite)}>+ Add someone</button>
        {showInvite && (
          <div className="invitebox">
            <h3>Add someone</h3>
            <div className="field"><label>Name</label>
              <input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} placeholder="Full name" /></div>
            <div className="field"><label>Email</label>
              <input value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="name@currenthome.com" /></div>
            <div className="field"><label>Phone (optional)</label>
              <input type="tel" value={inv.phone} onChange={(e) => setInv({ ...inv, phone: e.target.value })} placeholder="(000) 000-0000" /></div>
            <div className="field"><label>Department</label>
              <select value={inv.dept} onChange={(e) => setInv({ ...inv, dept: e.target.value })}>
                <option value="">Select a department</option>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select></div>
            <div className="field"><label>Access level</label>
              <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
              </select></div>
            <button className="btn" onClick={sendInvite} disabled={busy}>Save</button>
            <button className="mlink" onClick={() => setShowInvite(false)}>Cancel</button>
          </div>
        )}

        {!data && <div className="spinner">Loading…</div>}

        {data?.invites.map((p) => (
          <div key={p.email} className="pcard">
            <div className="ptop">
              <div>
                <div className="rname">{p.name || p.email}</div>
                <div className="rmeta">{p.email} · {p.dept}</div>
              </div>
              <div className="ppills">
                <span className={`pill2 acc-${p.role}`}>{p.role === "manager" ? "Manager" : "Employee"}</span>
                <span className="pill2 st-invited">Waiting for first sign-in</span>
              </div>
            </div>
          </div>
        ))}

        {data?.people.map((p) => (
          <div key={p.uid} className="pcard">
            <div className="ptop">
              <div>
                <div className="rname">{p.name}</div>
                <div className="rmeta">{p.email} · {p.dept || "No department"}{p.phone ? ` · ${p.phone}` : ""}</div>
              </div>
              <div className="ppills">
                <span className={`pill2 acc-${p.role}`}>{p.role === "manager" ? "Manager" : "Employee"}</span>
                <span className={`pill2 st-${p.status.toLowerCase()}`}>{p.status}</span>
              </div>
            </div>
            <div className="pactions">
              <button disabled={busy} onClick={() => act({ action: "setRole", uid: p.uid, role: p.role === "manager" ? "employee" : "manager" })}>
                {p.role === "manager" ? "Make employee" : "Make manager"}
              </button>
              <button disabled={busy} onClick={() => act({ action: "setActive", uid: p.uid, active: p.status === "Inactive" })}>
                {p.status === "Inactive" ? "Reactivate" : "Deactivate"}
              </button>
              <select
                disabled={busy}
                value={p.dept || ""}
                onChange={(e) => act({ action: "setDept", uid: p.uid, dept: e.target.value })}
                style={{ flex: 1, minWidth: 130, padding: 10, fontSize: 13 }}
              >
                <option value="">Department…</option>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
        ))}
      </ManagerGuard>
    </Shell>
  );
}
