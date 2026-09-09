"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/firebaseClient";
import { INTERVIEW_LABEL } from "@/lib/recruiting";
import { Modal, fmtDT } from "./ui";

// Read-only rendering of a finished scorecard. Used both for looking one up
// later and for the "what did the last interviewer think" panel while scoring.
export function ScorecardBody({ scorecard }) {
  if (!scorecard?.sections?.length) {
    return <div className="rc-empty">No section detail was captured for this interview.</div>;
  }
  return (
    <>
      {scorecard.sections.map((s, si) => (
        <div key={si} style={{ marginBottom: 14 }}>
          <h4 style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, color: "var(--slate)", margin: "0 0 8px", textTransform: "uppercase" }}>
            {s.label}
          </h4>
          {s.items.map((it, ii) => (
            <div key={ii} className="rc-iv" style={{ marginBottom: 7 }}>
              <div className="r1">
                <span className="tt" style={{ fontWeight: 500, fontSize: 12.5 }}>{it.text}</span>
                {it.type === "graded" && (
                  <span className="rc-stage s-hired">{it.score != null ? `${it.score}/10` : "—"}</span>
                )}
                {it.type === "yesno" && (
                  <span className={`rc-stage ${it.answer === "yes" ? "s-hired" : it.answer === "no" ? "s-rejected" : ""}`}>
                    {it.answer === "yes" ? "Yes" : it.answer === "no" ? "No" : "—"}
                  </span>
                )}
              </div>
              {(it.note || it.type === "note") && <div className="r2">{it.note || "—"}</div>}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function ScorecardView({ candidate, interview, onClose }) {
  return (
    <Modal
      title={`Scorecard · ${INTERVIEW_LABEL[interview.type]}`}
      onClose={onClose}
      footer={
        <button className="rc-btnsm ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="rc-note" style={{ marginTop: 0 }}>
        {candidate.name} · {candidate.role} — {fmtDT(interview.datetime)} · {interview.interviewerName}
      </p>
      <div className="rc-stats" style={{ marginBottom: 16 }}>
        <div className="rc-stat">
          <div className="l">Overall</div>
          <div className="v">{interview.score != null ? `${interview.score} / 10` : "—"}</div>
        </div>
        <div className="rc-stat">
          <div className="l">Basic quals</div>
          <div className="v">
            {interview.scorecard?.qualsTotal
              ? `${interview.scorecard.qualsMet} / ${interview.scorecard.qualsTotal} met`
              : "—"}
          </div>
        </div>
      </div>
      <ScorecardBody scorecard={interview.scorecard} />
      <div className="rc-sec" style={{ marginTop: 6, marginBottom: 0 }}>
        <h4>Overall feedback</h4>
        <div className="rc-note">{interview.notes || "—"}</div>
      </div>
    </Modal>
  );
}

export default function ScoreInterview({ candidate, interview, onClose, onScored }) {
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({
      dept: candidate.dept,
      role: candidate.role,
      ivType: interview.type,
    });
    api(`/api/recruiting/scorecards?${q}`)
      .then((d) => setForm(d.form))
      .catch((e) => setErr(e.message));
  }, [candidate.dept, candidate.role, interview.type]);

  // What earlier interviewers said, so nobody scores in a vacuum.
  const priors = useMemo(
    () =>
      (candidate.interviews || []).filter(
        (i) => i.id !== interview.id && i.status === "completed" && i.scorecard
      ),
    [candidate.interviews, interview.id]
  );

  const graded = (form?.sections || []).flatMap((s) => s.items.filter((i) => i.type === "graded"));
  const given = graded.map((i) => responses[i.id]?.score).filter((v) => v != null);
  const running = given.length ? (given.reduce((a, b) => a + b, 0) / given.length).toFixed(1) : null;

  const set = (id, patch) => setResponses((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await api(`/api/recruiting/candidates/${candidate.id}`, {
        method: "POST",
        body: { action: "scoreInterview", interviewId: interview.id, responses, notes },
      });
      onScored(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const empty = form && !(form.sections || []).some((s) => s.items.length);

  return (
    <Modal
      title={`${INTERVIEW_LABEL[interview.type]} scorecard`}
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy || !form || empty}>
            {busy ? "Saving…" : "Save scorecard"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <p className="rc-note" style={{ marginTop: 0, marginBottom: 14 }}>
        Scoring <b style={{ color: "var(--charcoal)" }}>{candidate.name}</b> · {candidate.role} · {candidate.dept}
      </p>

      {!form && !err && <div className="rc-empty">Loading the form…</div>}

      {empty && (
        <div className="toast warn">
          No {INTERVIEW_LABEL[interview.type]} form has been built for {candidate.role} yet. Build it on the
          Scorecards screen, then score here.
        </div>
      )}

      {priors.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, fontSize: 13, color: "var(--slate)", padding: "8px 0" }}>
            Previous interview results ({priors.length}) — worth a look before you score
          </summary>
          {priors.map((p) => (
            <div key={p.id} style={{ borderTop: "1px dashed var(--gray)", paddingTop: 10, marginTop: 8 }}>
              <p className="rc-note" style={{ marginTop: 0 }}>
                <b style={{ color: "var(--charcoal)" }}>{INTERVIEW_LABEL[p.type]}</b> · {fmtDT(p.datetime)} ·{" "}
                {p.interviewerName} — {p.score != null ? `${p.score}/10` : "—"}
              </p>
              <ScorecardBody scorecard={p.scorecard} />
              {p.notes && <div className="rc-note">{p.notes}</div>}
            </div>
          ))}
        </details>
      )}

      {form?.sections?.map((s) => (
        <div key={s.id} style={{ marginBottom: 18 }}>
          <h4 style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, color: "var(--slate)", margin: "0 0 10px", textTransform: "uppercase" }}>
            {s.label}
          </h4>
          {s.items.map((it) => (
            <div key={it.id} className="field">
              <label style={{ color: "var(--charcoal)", fontWeight: 500 }}>{it.text}</label>

              {it.type === "graded" && (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                      <button
                        key={n}
                        className="rc-chip"
                        onClick={() => set(it.id, { score: n })}
                        style={
                          responses[it.id]?.score === n
                            ? { flex: 1, background: "var(--cyan)", color: "var(--charcoal)", borderColor: "var(--cyan)", fontWeight: 700 }
                            : { flex: 1 }
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Optional note on their answer…"
                    value={responses[it.id]?.note || ""}
                    onChange={(e) => set(it.id, { note: e.target.value })}
                    style={{ minHeight: 56 }}
                  />
                </>
              )}

              {it.type === "yesno" && (
                <div style={{ display: "flex", gap: 8 }}>
                  {["yes", "no"].map((a) => (
                    <button
                      key={a}
                      className="rc-chip"
                      onClick={() => set(it.id, { answer: a })}
                      style={
                        responses[it.id]?.answer === a
                          ? {
                              flex: 1,
                              background: a === "yes" ? "#e5f7ea" : "#fdeceb",
                              color: a === "yes" ? "#1e7d34" : "#a33527",
                              borderColor: a === "yes" ? "#9adcb0" : "#f0b3ad",
                              fontWeight: 700,
                            }
                          : { flex: 1 }
                      }
                    >
                      {a === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              )}

              {it.type === "note" && (
                <textarea
                  placeholder="Notes…"
                  value={responses[it.id]?.note || ""}
                  onChange={(e) => set(it.id, { note: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {form && !empty && (
        <>
          <div className="field">
            <label>Overall feedback</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What stood out? Move forward or pass?"
            />
          </div>
          <div className="rc-stat">
            <div className="l">Average of the graded questions</div>
            <div className="v">{running ? `${running} / 10` : "—"}</div>
          </div>
        </>
      )}
    </Modal>
  );
}
