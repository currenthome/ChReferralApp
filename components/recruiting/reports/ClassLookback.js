"use client";

import { useState } from "react";
import {
  classStats,
  classJourney,
  classDirect,
  classOverhead,
  classCost,
  monthHires,
  monthOf,
  monthLabel,
  money,
  pct,
  tenureDays,
  overheadFields,
  daysBetween,
} from "@/lib/reporting";
import { fmtDate } from "../ui";
import { ClassCosts, PersonOutcome } from "./Editors";

// How one class turned out: who stayed, what it cost, and the whole run from
// applicant to a year on the job.
export default function ClassLookback({ data, canEditClass, onEditOverhead, onChanged }) {
  const { classes, peopleByClass, overhead, costFields, reasons, today } = data;
  const [pickedId, setPickedId] = useState(classes[0]?.id || "");
  const [editCosts, setEditCosts] = useState(false);
  const [person, setPerson] = useState(null);

  const cls = classes.find((c) => c.id === pickedId) || classes[0];
  if (!cls) return <p className="rc-note">No classes to report on yet.</p>;

  const people = peopleByClass[cls.id] || [];
  const s = classStats(people, reasons);
  const total = classCost(cls, classes, peopleByClass, overhead, costFields);
  const journey = classJourney(cls, people, today, reasons);
  const applicants = journey[0].count || 0;
  const mk = monthOf(cls.date);
  const monthTotal = monthHires(classes, peopleByClass, mk);
  const canEdit = canEditClass(cls);

  return (
    <>
      <div className="rc-bar">
        <select value={cls.id} onChange={(e) => setPickedId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {fmtDate(c.date).mon} {fmtDate(c.date).day} {c.date.slice(0, 4)} · {c.role} · {c.location}
            </option>
          ))}
        </select>
        <span className="rc-stage s-interviewing">{cls.dept}</span>
        <span className="grow" />
        <span className="rc-note">
          Started {fmtDate(cls.date).full} · {daysBetween(cls.date, today)} days ago
        </span>
      </div>

      <div className="rc-sech">Class outcome</div>
      <div className="rc-cards">
        <div className="rc-card">
          <div className="l">Hired</div>
          <div className="v">
            {s.hired}
            <span className="u"> / {cls.target} target</span>
          </div>
        </div>
        <div className="rc-card">
          <div className="l">Started</div>
          <div className="v">
            {s.started}
            <span className="u"> · {pct(s.started, s.hired)}</span>
          </div>
          {s.noShow > 0 && <div className="s">{s.noShow} never showed</div>}
        </div>
        <div className="rc-card">
          <div className="l">Graduated</div>
          <div className="v">
            {s.graduated}
            <span className="u"> · {pct(s.graduated, s.started)} of started</span>
          </div>
        </div>
        <div className="rc-card good">
          <div className="l">Still here</div>
          <div className="v">
            {s.active}
            <span className="u"> · {pct(s.active, s.started)}</span>
          </div>
        </div>
      </div>

      {Object.keys(s.byReason).length > 0 && (
        <div className="rc-bar" style={{ marginTop: 12, marginBottom: 0 }}>
          {Object.entries(s.byReason).map(([label, n]) => (
            <span key={label} className="rc-stage">
              <b>{n}</b> {label}
            </span>
          ))}
        </div>
      )}

      <div className="rc-sech">
        What it cost
        {canEdit && (
          <button className="rc-btnsm ghost" style={{ marginLeft: 10 }} onClick={() => setEditCosts(true)}>
            Edit class costs
          </button>
        )}
      </div>
      <div className="rc-cards">
        <div className="rc-card">
          <div className="l">Entered on this class</div>
          <div className="v">{money(classDirect(cls, costFields))}</div>
        </div>
        <div className="rc-card">
          <div className="l">Share of monthly overhead</div>
          <div className="v">{money(classOverhead(cls, classes, peopleByClass, overhead, costFields))}</div>
        </div>
        <div className="rc-card">
          <div className="l">All in</div>
          <div className="v">{money(total)}</div>
        </div>
        <div className="rc-card">
          <div className="l">Per hire</div>
          <div className="v">{s.hired ? money(total / s.hired) : "—"}</div>
        </div>
        <div className="rc-card good">
          <div className="l">Per person still here</div>
          <div className="v">{s.active ? money(total / s.active) : "—"}</div>
        </div>
      </div>

      <div className="rc-oh">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <span>
            <b>{monthLabel(mk)} overhead</b>
          </span>
          {onEditOverhead && (
            <button className="rc-btnsm ghost" onClick={onEditOverhead}>
              Edit monthly overhead
            </button>
          )}
        </div>
        This class hired <b>{people.length}</b> of the <b>{monthTotal}</b> people hired that month, so it
        carries <b>{pct(people.length, monthTotal)}</b> of the pool (
        {overheadFields(costFields)
          .map((f) => `${f.label} ${money((overhead[mk] || {})[f.id] || 0)}`)
          .join(" + ") || "nothing entered yet"}
        ) = <b>{money(classOverhead(cls, classes, peopleByClass, overhead, costFields))}</b>
      </div>

      <div className="rc-sech">
        Applicant to one year<span className="sub">cost each = all-in cost ÷ people at that step</span>
      </div>
      <div className="rc-tablewrap">
        <div className="rc-table">
          <div className="rc-row head" style={{ gridTemplateColumns: "1.4fr .7fr .9fr .9fr .9fr" }}>
            <span>Step</span>
            <span>People</span>
            <span>Of applicants</span>
            <span>Of previous step</span>
            <span>Cost each</span>
          </div>
          {journey.map((st, i) => (
            <div
              key={i}
              className={`rc-row${st.phase === "ret" ? " ret" : ""}${st.notYet ? " dim" : ""}`}
              style={{ gridTemplateColumns: "1.4fr .7fr .9fr .9fr .9fr" }}
            >
              <span>{st.label}</span>
              <span className="n">{st.notYet ? "—" : st.count}</span>
              <span>{st.notYet ? "too early" : pct(st.count, applicants)}</span>
              <span>{st.of == null || st.notYet ? "—" : pct(st.count, st.of)}</span>
              <span>{!st.notYet && st.count > 0 ? money(total / st.count) : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="rc-note" style={{ marginTop: 8 }}>
        Retention steps read "too early" until someone in the class has been there long enough to judge.
        Each person is measured from their own first day.
      </p>

      <div className="rc-sech">
        Roster<span className="sub">{canEdit ? "tap anyone to record what happened" : "view only"}</span>
      </div>
      <div className="rc-tablewrap">
        {people.length ? (
          people.map((p) => {
            const t = tenureDays(p, today);
            const label = !p.started
              ? ["No-show", "noshow"]
              : p.terminationDate
              ? [reasons.find((r) => r.id === p.termReasonId)?.label || "Left", "gone"]
              : ["Here", "active"];
            return (
              <button
                key={p.id}
                className="rc-personrow"
                disabled={!canEdit}
                onClick={() => canEdit && setPerson(p)}
              >
                <span>
                  {p.name}
                  {p.referrerName ? <span className="tn"> · referred by {p.referrerName}</span> : null}
                  <span className="tn"> · first day {p.startDate || "not set"}</span>
                </span>
                <span className="tn">
                  {t == null ? "—" : `${t} days${p.terminationDate ? "" : " and counting"}`}
                  {p.graduated ? " · graduated" : ""}
                </span>
                <span className={`rc-oc ${label[1]}`}>{label[0]}</span>
              </button>
            );
          })
        ) : (
          <div className="rc-empty" style={{ padding: 14 }}>
            Nobody hired into this class yet.
          </div>
        )}
      </div>

      {editCosts && (
        <ClassCosts
          cls={cls}
          costFields={costFields}
          onClose={() => setEditCosts(false)}
          onSaved={(m) => {
            setEditCosts(false);
            onChanged(m);
          }}
        />
      )}
      {person && (
        <PersonOutcome
          person={person}
          reasons={reasons}
          onClose={() => setPerson(null)}
          onSaved={(m) => {
            setPerson(null);
            onChanged(m);
          }}
        />
      )}
    </>
  );
}
