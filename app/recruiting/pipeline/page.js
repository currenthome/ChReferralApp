"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import { CANDIDATE_STAGES, STAGE_LABEL, INTERVIEW_LABEL } from "@/lib/recruiting";
import AddCandidate from "@/components/recruiting/AddCandidate";
import CandidateDrawer from "@/components/recruiting/CandidateDrawer";
import { fmtDT } from "@/components/recruiting/ui";

export default function Pipeline() {
  const { profile } = useAuth();
  const [cands, setCands] = useState(null);
  const [classes, setClasses] = useState([]);
  const [roles, setRoles] = useState({});
  const [people, setPeople] = useState([]);
  const [dept, setDept] = useState("all");
  const [toast, setToast] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const [c, cls, r, p] = await Promise.all([
      api("/api/recruiting/candidates"),
      api("/api/recruiting/classes"),
      api("/api/recruiting/roles"),
      api("/api/recruiting/people"),
    ]);
    setCands(c.candidates);
    setClasses(cls.classes);
    setRoles(r.roles);
    setPeople(p.people);
    return c.candidates;
  }, []);

  useEffect(() => {
    if (profile?.v2Visible) load().catch((e) => setToast(e.message));
  }, [profile, load]);

  // The drawer needs whichever candidate is open kept in step with the list.
  useEffect(() => {
    if (!openId) {
      setOpen(null);
      return;
    }
    setOpen(cands?.find((c) => c.id === openId) || null);
  }, [openId, cands]);

  async function refresh(message) {
    setToast(message || "");
    await load();
  }

  const scoped = (cands || []).filter((c) => dept === "all" || c.dept === dept);
  const allDepts = profile?.v2Access !== "dept-manager";
  const onHold = scoped.filter((c) => c.stage === "on_hold");
  const rejected = scoped.filter((c) => c.stage === "rejected");

  function nextLine(c) {
    const next = c.interviews?.find((i) => i.status === "scheduled");
    if (next) return `${INTERVIEW_LABEL[next.type]} · ${fmtDT(next.datetime)} · ${next.interviewerName}`;
    if (c.stage === "interviewing") return "Needs an interview scheduled";
    if (c.stage === "hired" && c.startDate) return `Starts ${c.startDate}`;
    return "";
  }

  return (
    <Shell wide nav={false}>
      <V2Guard>
        <h1>Pipeline</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Every active candidate by stage. Open anyone to schedule, advance, hold, or hire them.
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
          <button className="rc-btnsm" onClick={() => setAdding(true)}>
            + Add candidate
          </button>
        </div>

        {!cands && <div className="spinner">Loading…</div>}

        {cands && (
          <>
            <div className="rc-cols">
              {CANDIDATE_STAGES.map((st) => {
                const col = scoped.filter((c) => c.stage === st);
                return (
                  <div key={st} className="rc-col">
                    <div className="rc-colhead">
                      <span>{STAGE_LABEL[st]}</span>
                      <span className="n">{col.length}</span>
                    </div>
                    {col.length ? (
                      col.map((c) => (
                        <button key={c.id} className="rc-kcard" onClick={() => setOpenId(c.id)}>
                          <div className="nm">{c.name}</div>
                          <div className="rl">
                            {c.role}
                            {allDepts ? ` · ${c.dept}` : ""}
                          </div>
                          {nextLine(c) && <div className="nx">{nextLine(c)}</div>}
                          {c.referrerName && <div className="rl">Referred by {c.referrerName}</div>}
                        </button>
                      ))
                    ) : (
                      <div className="rc-empty">—</div>
                    )}
                  </div>
                );
              })}
            </div>

            {onHold.length > 0 && (
              <div className="rc-sidebar">
                <span className="lbl">ON HOLD ({onHold.length})</span>
                {onHold.map((c) => (
                  <button key={c.id} className="rc-chip" onClick={() => setOpenId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {rejected.length > 0 && (
              <div className="rc-sidebar">
                <span className="lbl">REJECTED ({rejected.length})</span>
                {rejected.map((c) => (
                  <button key={c.id} className="rc-chip" onClick={() => setOpenId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {adding && (
          <AddCandidate
            profile={profile}
            roles={roles}
            classes={classes}
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
            classes={classes}
            people={people}
            canWork={allDepts || open.dept === profile?.dept}
            onClose={() => setOpenId(null)}
            onChanged={refresh}
          />
        )}
      </V2Guard>
    </Shell>
  );
}
