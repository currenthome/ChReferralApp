"use client";

import { useState } from "react";
import { api } from "@/lib/firebaseClient";
import { INTERVIEW_TYPES, INTERVIEW_LABEL, STAGE_LABEL } from "@/lib/recruiting";
import { Modal, fmtDate, fmtDT } from "./ui";
import ScoreInterview, { ScorecardView } from "./ScoreInterview";

const today = () => new Date().toISOString().slice(0, 10);

// What a person can do from each stage, matching the server's own rules in
// app/api/recruiting/candidates/[id]/route.js. The server is what enforces
// them; these buttons just avoid offering a move that would be refused.
function movesFor(stage) {
  if (stage === "interviewing") return [["offer_extended", "Extend offer"], ["on_hold", "Put on hold"], ["rejected", "Reject"]];
  if (stage === "offer_extended") return [["offer_accepted", "Offer accepted"], ["on_hold", "Put on hold"], ["rejected", "Reject"]];
  if (stage === "offer_accepted") return [["rejected", "Reject"]];
  if (stage === "on_hold") return [["interviewing", "Resume interviewing"], ["rejected", "Reject"]];
  if (stage === "rejected") return [["interviewing", "Reopen candidate"]];
  return [];
}

export default function CandidateDrawer({ candidate, classes, people, canWork, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [scoring, setScoring] = useState(null);
  const [viewing, setViewing] = useState(null);

  const cls = classes.find((c) => c.id === candidate.classId) || null;
  const interviewers = people.filter((p) => p.allDepts || p.dept === candidate.dept);

  const [iv, setIv] = useState({ type: "phone", date: today(), time: "10:00", interviewerUid: "" });
  // A hire's first day defaults to their class date — one tap when they match,
  // editable when they don't (decision 3A.2).
  const [firstDay, setFirstDay] = useState(cls?.date || today());

  async function act(body, closeAfter) {
    setBusy(true);
    setErr("");
    try {
      const res = await api(`/api/recruiting/candidates/${candidate.id}`, { method: "POST", body });
      if (closeAfter) closeAfter();
      await onChanged(res.message);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const scheduled = candidate.interviews?.filter((i) => i.status === "scheduled") || [];

  return (
    <>
      <div className="rc-scrim" onClick={onClose} />
      <div className="rc-drawer">
        <div className="rc-dh">
          <button className="rc-x" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <div className="nm">{candidate.name}</div>
          <div className="sb">
            {candidate.role} · {candidate.dept} · {STAGE_LABEL[candidate.stage]}
          </div>
          {candidate.referrerName && (
            <div className="ref">
              Referred by {candidate.referrerName}
              {candidate.referrerDept ? ` · ${candidate.referrerDept}` : ""}
            </div>
          )}
        </div>

        <div className="rc-db">
          {err && <div className="toast warn">{err}</div>}

          <div className="rc-sec">
            <div className="rc-stats">
              <div className="rc-stat">
                <div className="l">Stage</div>
                <div className="v">{STAGE_LABEL[candidate.stage]}</div>
              </div>
              <div className="rc-stat">
                <div className="l">Interviews</div>
                <div className="v">{candidate.interviews?.length || 0}</div>
              </div>
              <div className="rc-stat">
                <div className="l">Target class</div>
                <div className="v" style={{ fontSize: 12.5 }}>
                  {cls ? `${fmtDate(cls.date).mon} ${fmtDate(cls.date).day} · ${cls.location}` : "Not in a class"}
                </div>
              </div>
              <div className="rc-stat">
                <div className="l">First day</div>
                <div className="v" style={{ fontSize: 12.5 }}>
                  {candidate.startDate ? fmtDate(candidate.startDate).full : "—"}
                </div>
              </div>
            </div>
          </div>

          {candidate.referralMatches > 1 && (
            <div className="toast warn">
              {candidate.referralMatches} employee referrals share this mobile number, so nobody was
              credited as the referrer. Someone needs to work out which one is right.
            </div>
          )}

          <div className="rc-sec">
            <h4>Contact</h4>
            <div className="contactrow">
              <a className="callchip" href={`tel:${candidate.phoneKey}`}>
                <span className="cc">
                  <span className="ccl">MOBILE</span>
                  <span className="ccn">{candidate.phone}</span>
                </span>
              </a>
              {candidate.email && (
                <a className="callchip" href={`mailto:${candidate.email}`}>
                  <span className="cc">
                    <span className="ccl">EMAIL</span>
                    <span className="ccn">{candidate.email}</span>
                  </span>
                </a>
              )}
              {candidate.resumeUrl && (
                <a className="callchip" href={candidate.resumeUrl} target="_blank" rel="noopener">
                  <span className="cc">
                    <span className="ccl">RESUME</span>
                    <span className="ccn">{candidate.resumeName || "View resume"} ›</span>
                  </span>
                </a>
              )}
            </div>
          </div>

          {candidate.prescreenNotes && (
            <div className="rc-sec">
              <h4>Phone pre-screen</h4>
              <div className="rc-ps">
                <b>{candidate.prescreenByName || "Recruiting team"}</b>
                {candidate.prescreenNotes}
              </div>
            </div>
          )}

          <div className="rc-sec">
            <h4>Interviews</h4>
            {candidate.interviews?.length ? (
              candidate.interviews.map((i) => (
                <div key={i.id} className={`rc-iv${i.status === "completed" ? " done" : ""}`}>
                  <div className="r1">
                    <span className="tt">{INTERVIEW_LABEL[i.type]}</span>
                    {i.status === "completed" ? (
                      <span className="rc-stage s-hired">{i.score != null ? `${i.score}/10` : "Done"}</span>
                    ) : (
                      <span className="rc-stage s-interviewing">Scheduled</span>
                    )}
                  </div>
                  <div className="r2">
                    {fmtDT(i.datetime)} · {i.interviewerName}
                  </div>
                  {i.status === "completed" && i.scorecard?.qualsTotal ? (
                    <div className="r2">
                      Basic quals: {i.scorecard.qualsMet}/{i.scorecard.qualsTotal} met
                    </div>
                  ) : null}
                  {i.status === "completed" && i.notes ? <div className="r2">{i.notes}</div> : null}
                  <div style={{ marginTop: 9 }}>
                    {i.status === "completed" ? (
                      <button className="rc-btnsm ghost" onClick={() => setViewing(i)}>
                        View scorecard
                      </button>
                    ) : (
                      canWork && (
                        <button className="rc-btnsm" onClick={() => setScoring(i)}>
                          Score this interview
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rc-empty">No interviews yet.</div>
            )}
            {canWork && candidate.stage !== "hired" && (
              <button className="rc-btnsm ghost" style={{ marginTop: 4 }} onClick={() => setSchedOpen(true)}>
                + Schedule interview
              </button>
            )}
          </div>

          {canWork ? (
            <div className="rc-acts">
              {candidate.stage === "offer_accepted" && (
                <button className="rc-btnsm" disabled={busy} onClick={() => setHireOpen(true)}>
                  ✓ Hire &amp; set first day
                </button>
              )}
              {movesFor(candidate.stage).map(([to, label], idx) => (
                <button
                  key={to}
                  className={`rc-btnsm ${to === "rejected" ? "danger" : "ghost"}`}
                  disabled={busy}
                  onClick={() => act({ action: "stage", to })}
                  style={to === "rejected" && idx > 0 ? { marginLeft: "auto" } : undefined}
                >
                  {label}
                </button>
              ))}
              {candidate.stage === "hired" && (
                <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 13 }}>
                  ✓ Hired — first day {candidate.startDate ? fmtDate(candidate.startDate).full : "not set"}
                </div>
              )}
            </div>
          ) : (
            <div className="rc-note">View only — this candidate is outside your department.</div>
          )}
        </div>
      </div>

      {schedOpen && (
        <Modal
          title="Schedule interview"
          onClose={() => setSchedOpen(false)}
          footer={
            <>
              <button className="rc-btnsm ghost" onClick={() => setSchedOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                className="rc-btnsm"
                disabled={busy}
                onClick={() =>
                  act(
                    {
                      action: "scheduleInterview",
                      type: iv.type,
                      date: iv.date,
                      time: iv.time,
                      interviewerUid: iv.interviewerUid || interviewers[0]?.uid || "",
                    },
                    () => setSchedOpen(false)
                  )
                }
              >
                Schedule
              </button>
            </>
          }
        >
          <p className="rc-note" style={{ marginTop: 0, marginBottom: 14 }}>
            {candidate.name} · {candidate.role}
            {scheduled.length ? ` — already has ${scheduled.length} scheduled` : ""}
          </p>
          <div className="rc-f2">
            <div className="field">
              <label>Type</label>
              <select value={iv.type} onChange={(e) => setIv({ ...iv, type: e.target.value })}>
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INTERVIEW_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Interviewer</label>
              <select
                value={iv.interviewerUid || interviewers[0]?.uid || ""}
                onChange={(e) => setIv({ ...iv, interviewerUid: e.target.value })}
              >
                {interviewers.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rc-f2">
            <div className="field">
              <label>Date</label>
              <input type="date" value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={iv.time} onChange={(e) => setIv({ ...iv, time: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {scoring && (
        <ScoreInterview
          candidate={candidate}
          interview={scoring}
          onClose={() => setScoring(null)}
          onScored={(m) => {
            setScoring(null);
            onChanged(m);
          }}
        />
      )}

      {viewing && (
        <ScorecardView candidate={candidate} interview={viewing} onClose={() => setViewing(null)} />
      )}

      {hireOpen && (
        <Modal
          title={`Hire ${candidate.name}`}
          onClose={() => setHireOpen(false)}
          footer={
            <>
              <button className="rc-btnsm ghost" onClick={() => setHireOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                className="rc-btnsm"
                disabled={busy}
                onClick={() => act({ action: "hire", startDate: firstDay }, () => setHireOpen(false))}
              >
                Hire
              </button>
            </>
          }
        >
          <div className="field">
            <label>Their first day</label>
            <input type="date" value={firstDay} onChange={(e) => setFirstDay(e.target.value)} />
            <div className="rc-hint">
              {cls
                ? `Pre-filled with the ${fmtDate(cls.date).mon} ${fmtDate(cls.date).day} class date — change it if they start on a different day.`
                : "This person isn't in a class, so pick the day they actually start."}
            </div>
          </div>
          <p className="rc-note" style={{ marginBottom: candidate.referrerName ? 12 : 0 }}>
            Every retention number for this person counts from this date.
          </p>
          {candidate.referrerName && (
            <div className="rc-oh" style={{ marginTop: 0 }}>
              <b>{candidate.referrerName}</b> referred this person. Hiring them advances that referral to
              Hired and hands it this date, so {candidate.referrerName.split(" ")[0]} gets paid on the
              same schedule as any other referral — nothing else to do.
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
