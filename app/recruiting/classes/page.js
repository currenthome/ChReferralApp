"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import AddCandidate from "@/components/recruiting/AddCandidate";
import CandidateDrawer from "@/components/recruiting/CandidateDrawer";
import { Modal, StageBadge, initials, fmtDate } from "@/components/recruiting/ui";

const today = () => new Date().toISOString().slice(0, 10);

function RequestClass({ profile, roles, editing, onClose, onDone }) {
  const lockedDept = profile?.v2Access === "dept-manager" ? profile.dept : null;
  const [dept, setDept] = useState(editing?.dept || lockedDept || DEPARTMENTS[0]);
  const [role, setRole] = useState(editing?.role || "");
  const [date, setDate] = useState(editing?.date || today());
  const [target, setTarget] = useState(editing?.target ?? 10);
  const [location, setLocation] = useState(editing?.location === "TBD" ? "" : editing?.location || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // A class with people lined up for it can change its date, location and
  // size, but not its department or role — they'd be stranded.
  // Everyone still pointing at the class, rejected included — the same count
  // the server uses, so the screen never promises something it will refuse.
  const seated = editing?.attached ?? 0;

  const deptRoles = roles[dept] || [];
  useEffect(() => {
    if (!deptRoles.includes(role)) setRole(deptRoles[0] || "");
  }, [dept, deptRoles, role]);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = editing
        ? await api(`/api/recruiting/classes/${editing.id}`, {
            method: "POST",
            body: { action: "edit", dept, role, date, target: Number(target), location },
          })
        : await api("/api/recruiting/classes", {
            method: "POST",
            body: { dept, role, date, target: Number(target), location },
          });
      onDone(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setErr("");
    try {
      const res = await api(`/api/recruiting/classes/${editing.id}`, { method: "DELETE" });
      onDone(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit class" : "Request a class"}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button
              className="rc-btnsm danger"
              style={{ marginRight: "auto" }}
              disabled={busy}
              onClick={remove}
            >
              Delete class
            </button>
          )}
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Request class"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <div className="rc-f2">
        <div className="field">
          <label>Department</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={!!lockedDept || seated > 0}>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {lockedDept && <div className="rc-hint">Locked to your department.</div>}
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={seated > 0}>
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
      {seated > 0 && (
        <p className="rc-note" style={{ marginBottom: 0 }}>
          {seated} {seated === 1 ? "person is" : "people are"} in this class, so its department and role are
          fixed, and it can't be deleted. Date, location and size can still change. To empty it, open each
          person from the Pipeline and change their class — or delete them if they were added by mistake.
        </p>
      )}
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
  const [editingClass, setEditingClass] = useState(null);
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

  // Soonest first is what you want while you're filling classes. Ones that
  // have already run go underneath, most recent first, so a class from last
  // year isn't the first thing on the screen.
  const stamp = today();
  const upcoming = scoped.filter((c) => c.date >= stamp).sort((a, b) => a.date.localeCompare(b.date));
  const past = scoped.filter((c) => c.date < stamp).sort((a, b) => b.date.localeCompare(a.date));
  const shown = [...upcoming, ...past];
  const thisYear = stamp.slice(0, 4);

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
          {shown.map((c, i) => {
            const d = fmtDate(c.date);
            // One divider, where the upcoming ones end and the old ones start.
            const startsPast = c.date < stamp && (i === 0 || shown[i - 1].date >= stamp);
            const pct = c.target ? Math.round((c.seats.hired / c.target) * 100) : 0;
            const seats = [
              ...Array(c.seats.hired).fill("filled"),
              ...Array(c.seats.pending).fill("pending"),
              ...Array(c.seats.open).fill("open"),
            ];
            return (
              <Fragment key={c.id}>
              {startsPast && (
                <div className="rc-sech gridfull">
                  Already run<span className="sub">most recent first</span>
                </div>
              )}
              <div className="mcard">
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
                      {/* The year only shows when it isn't this one — without it
                          a 2025 class reads as out of order next to a 2026 one. */}
                      <div className="rmeta">
                        {d.weekday}
                        {c.date.slice(0, 4) !== thisYear ? ` · ${c.date.slice(0, 4)}` : ""}
                      </div>
                    </div>
                  </div>
                  <button className="rc-btnsm ghost" onClick={() => setEditingClass(c)}>
                    Edit
                  </button>
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
              </Fragment>
            );
          })}
        </div>

        {(asking || editingClass) && (
          <RequestClass
            profile={profile}
            roles={roles}
            editing={editingClass}
            onClose={() => {
              setAsking(false);
              setEditingClass(null);
            }}
            onDone={(m) => {
              setAsking(false);
              setEditingClass(null);
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
