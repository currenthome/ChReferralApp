"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import AddCandidate from "@/components/recruiting/AddCandidate";
import CandidateDrawer from "@/components/recruiting/CandidateDrawer";
import { Modal, StageBadge, initials, fmtDate } from "@/components/recruiting/ui";

const today = () => new Date().toISOString().slice(0, 10);

function RequestClass({ profile, roles, onClose, onDone }) {
  const lockedDept = profile?.v2Access === "dept-manager" ? profile.dept : null;
  const [dept, setDept] = useState(lockedDept || DEPARTMENTS[0]);
  const [role, setRole] = useState("");
  const [date, setDate] = useState(today());
  const [target, setTarget] = useState(10);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const deptRoles = roles[dept] || [];
  useEffect(() => {
    if (!deptRoles.includes(role)) setRole(deptRoles[0] || "");
  }, [dept, deptRoles, role]);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/recruiting/classes", {
        method: "POST",
        body: { dept, role, date, target: Number(target), location },
      });
      onDone(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Request a class"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Requesting…" : "Request class"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <div className="rc-f2">
        <div className="field">
          <label>Department</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={!!lockedDept}>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {lockedDept && <div className="rc-hint">Locked to your department.</div>}
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {deptRoles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="rc-f2">
        <div className="field">
          <label>Class start date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>How many people</label>
          <input type="number" min="1" max="40" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Location</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Riverside Office, Remote / Phoenix" />
        <div className="rc-hint">Free text — wherever this class will run.</div>
      </div>
    </Modal>
  );
}

export default function Classes() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState({});
  const [people, setPeople] = useState([]);
  const [dept, setDept] = useState("all");
  const [toast, setToast] = useState("");
  const [asking, setAsking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const [cls, r, p] = await Promise.all([
      api("/api/recruiting/classes"),
      api("/api/recruiting/roles"),
      api("/api/recruiting/people"),
    ]);
    setData(cls);
    setRoles(r.roles);
    setPeople(p.people);
  }, []);

  useEffect(() => {
    if (profile?.v2Visible) load().catch((e) => setToast(e.message));
  }, [profile, load]);

  async function refresh(message) {
    setToast(message || "");
    await load();
    if (open) {
      const fresh = await api(`/api/recruiting/candidates/${open.id}`).catch(() => null);
      setOpen(fresh?.candidate || null);
    }
  }

  async function openCandidate(id) {
    try {
      const res = await api(`/api/recruiting/candidates/${id}`);
      setOpen(res.candidate);
    } catch (e) {
      setToast(e.message);
    }
  }

  const scoped = (data?.classes || []).filter((c) => dept === "all" || c.dept === dept);
  const allDepts = profile?.v2Access !== "dept-manager";

  return (
    <Shell wide nav={false}>
      <V2Guard>
        <h1>Classes</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Request a class, then watch it fill as candidates move toward hired.
        </p>
        {toast && <div className="toast">{toast}</div>}

        <div className="rc-bar">
          {allDepts && (
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          )}
          <span className="grow" />
          <button className="rc-btnsm ghost" onClick={() => setAdding(true)}>
            + Add candidate
          </button>
          <button className="rc-btnsm" onClick={() => setAsking(true)}>
            + Request a class
          </button>
        </div>

        {!data && <div className="spinner">Loading…</div>}
        {data && !scoped.length && (
          <p className="rc-note">No classes yet. Request the first one above.</p>
        )}

        <div className="cardgrid">
          {scoped.map((c) => {
            const d = fmtDate(c.date);
            const pct = c.target ? Math.round((c.seats.hired / c.target) * 100) : 0;
            const seats = [
              ...Array(c.seats.hired).fill("filled"),
              ...Array(c.seats.pending).fill("pending"),
              ...Array(c.seats.open).fill("open"),
            ];
            return (
              <div key={c.id} className="mcard">
                <div className="rtop">
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="rc-datechip">
                      <span className="d">{d.day}</span>
                      <span className="m">{d.mon}</span>
                    </div>
                    <div>
                      <div className="rname">{c.role}</div>
                      <div className="rmeta">
                        {c.dept} · {c.location}
                      </div>
                      <div className="rmeta">{d.weekday}</div>
                    </div>
                  </div>
                </div>

                <div className="rc-seats">
                  <div className="rc-seatrow">
                    <div className="ct">
                      {c.seats.hired}
                      <span> / {c.target} hired</span>
                    </div>
                    <div className="pc">{pct}% filled</div>
                  </div>
                  <div className="rc-seatgrid">
                    {seats.map((s, i) => (
                      <span key={i} className={`rc-seat ${s}`} />
                    ))}
                  </div>
                  <div className="rc-legend">
                    <span>
                      <i className="f" />
                      Hired
                    </span>
                    <span>
                      <i className="p" />
                      In pipeline ({c.seats.pending})
                    </span>
                    <span>
                      <i />
                      Open ({c.seats.open})
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  {c.candidates.length ? (
                    c.candidates.map((p) => (
                      <button key={p.id} className="rc-candrow" onClick={() => openCandidate(p.id)}>
                        <span className="rc-ci">{initials(p.name)}</span>
                        <span className="rc-crmain">
                          <span className="nm">{p.name}</span>
                          {p.referrerName && <span className="sb">Referred by {p.referrerName}</span>}
                        </span>
                        <StageBadge stage={p.stage} />
                      </button>
                    ))
                  ) : (
                    <div className="rc-empty" style={{ borderTop: "1px solid var(--gray)", paddingTop: 10 }}>
                      No candidates yet — they stack up here as they enter the pipeline.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {asking && (
          <RequestClass
            profile={profile}
            roles={roles}
            onClose={() => setAsking(false)}
            onDone={(m) => {
              setAsking(false);
              refresh(m);
            }}
          />
        )}
        {adding && (
          <AddCandidate
            profile={profile}
            roles={roles}
            classes={data?.classes || []}
            people={people}
            onClose={() => setAdding(false)}
            onAdded={(m) => {
              setAdding(false);
              refresh(m);
            }}
          />
        )}
        {open && (
          <CandidateDrawer
            candidate={open}
            classes={data?.classes || []}
            people={people}
            canWork={allDepts || open.dept === profile?.dept}
            onClose={() => setOpen(null)}
            onChanged={refresh}
          />
        )}
      </V2Guard>
    </Shell>
  );
}
