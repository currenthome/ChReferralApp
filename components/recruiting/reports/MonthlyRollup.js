"use client";

import { useState } from "react";
import {
  classStats,
  classCost,
  directFields,
  overheadFields,
  milestoneStat,
  RETENTION_MILESTONES,
  monthOf,
  monthLabel,
  money,
  pct,
} from "@/lib/reporting";

// Every class in a month, added up. Pick more than one month to compare.
export default function MonthlyRollup({ data, onEditOverhead }) {
  const { classes, peopleByClass, overhead, costFields, reasons, today } = data;

  const byMonth = {};
  classes.forEach((c) => {
    const mk = monthOf(c.date);
    (byMonth[mk] = byMonth[mk] || []).push(c);
  });
  const months = [...new Set([...Object.keys(byMonth), ...Object.keys(overhead)])].sort().reverse();

  const [picked, setPicked] = useState(() => months.slice(0, Math.min(4, months.length)));
  const toggle = (m) => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  if (!months.length) return <p className="rc-note">No classes to report on yet.</p>;

  const sel = picked.filter((m) => months.includes(m));
  const selClasses = sel.flatMap((m) => byMonth[m] || []);
  const n = sel.length || 1;

  const agg = { applicants: 0, adApplications: 0, prescreens: 0, interviewed: 0, hired: 0, started: 0, graduated: 0, active: 0, separated: 0, noShow: 0 };
  const byCat = {};
  costFields.forEach((f) => (byCat[f.id] = 0));

  selClasses.forEach((c) => {
    const people = peopleByClass[c.id] || [];
    const s = classStats(people, reasons);
    const f = c.funnel || {};
    agg.applicants += Number(f.applicants || 0);
    agg.adApplications += Number(f.adApplications || 0);
    agg.prescreens += Number(f.prescreens || 0);
    agg.interviewed += Number(f.interviewed || 0);
    agg.hired += s.hired;
    agg.started += s.started;
    agg.graduated += s.graduated;
    agg.active += s.active;
    agg.separated += s.separated;
    agg.noShow += s.noShow;
    directFields(costFields).forEach((cc) => (byCat[cc.id] += Number(c.costs?.[cc.id] || 0)));
  });

  // Overhead is counted whole for a selected month, not per class — the
  // months are what's being added up here.
  sel.forEach((mk) => {
    const pool = overhead[mk] || {};
    overheadFields(costFields).forEach((cc) => (byCat[cc.id] += Number(pool[cc.id] || 0)));
  });
  const total = costFields.reduce((sum, f) => sum + byCat[f.id], 0);

  const steps = [
    ["Applicants", agg.applicants, null],
    ["Prescreens", agg.prescreens, agg.applicants],
    ["Interviews", agg.interviewed, agg.prescreens],
    ["Hired", agg.hired, agg.interviewed],
    ["Started", agg.started, agg.hired],
    ["Graduated", agg.graduated, agg.started],
  ];

  const multi = sel.length > 1;
  const avg = (x) => Math.round(x / n);

  return (
    <>
      <div className="rc-bar">
        {months.map((m) => (
          <button
            key={m}
            className="rc-chip"
            onClick={() => toggle(m)}
            style={
              sel.includes(m)
                ? { background: "var(--charcoal)", color: "#fff", borderColor: "var(--charcoal)", fontWeight: 700 }
                : undefined
            }
          >
            {monthLabel(m)} · {(byMonth[m] || []).length}
          </button>
        ))}
        <span className="grow" />
        {onEditOverhead && (
          <button className="rc-btnsm ghost" onClick={onEditOverhead}>
            Monthly overhead
          </button>
        )}
      </div>

      {!sel.length ? (
        <p className="rc-note">Pick at least one month above.</p>
      ) : (
        <>
          <div className="rc-sech">
            {sel.length} month{multi ? "s" : ""} · {selClasses.length} classes
            {multi && <span className="sub">totals, with the monthly average underneath</span>}
          </div>
          <div className="rc-cards">
            <div className="rc-card">
              <div className="l">Total cost</div>
              <div className="v">{money(total)}</div>
              {multi && <div className="s">{money(total / n)} a month</div>}
            </div>
            <div className="rc-card">
              <div className="l">Hired</div>
              <div className="v">{agg.hired}</div>
              {multi && <div className="s">{avg(agg.hired)} a month</div>}
            </div>
            <div className="rc-card">
              <div className="l">Started</div>
              <div className="v">{agg.started}</div>
              {multi && <div className="s">{avg(agg.started)} a month</div>}
            </div>
            <div className="rc-card good">
              <div className="l">Still here</div>
              <div className="v">{agg.active}</div>
              {multi && <div className="s">{avg(agg.active)} a month</div>}
            </div>
            <div className="rc-card">
              <div className="l">Cost per hire</div>
              <div className="v">{agg.hired ? money(total / agg.hired) : "—"}</div>
            </div>
          </div>

          <div className="rc-sech">Where people drop off</div>
          <div className="rc-tablewrap">
            <div className="rc-table">
              <div className="rc-row head" style={{ gridTemplateColumns: "1.4fr .7fr .9fr .9fr .9fr" }}>
                <span>Step</span>
                <span>People</span>
                <span>Of applicants</span>
                <span>Of previous step</span>
                <span>Cost each</span>
              </div>
              {steps.map(([label, count, of], i) => (
                <div key={label} className={`rc-row${i >= 4 ? " ret" : ""}`} style={{ gridTemplateColumns: "1.4fr .7fr .9fr .9fr .9fr" }}>
                  <span>{label}</span>
                  <span className="n">{count}</span>
                  <span>{pct(count, agg.applicants)}</span>
                  <span>{of == null ? "—" : pct(count, of)}</span>
                  <span>{count > 0 ? money(total / count) : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rc-sech">
            Retention<span className="sub">only people who've been here long enough to judge</span>
          </div>
          <div className="rc-mile">
            {RETENTION_MILESTONES.map((m) => {
              const people = selClasses.flatMap((c) => (peopleByClass[c.id] || []).filter((p) => p.started));
              const stat = milestoneStat(people, m.days, today);
              if (!stat.measurable) {
                return (
                  <div key={m.key} className="rc-mstep dim">
                    <div className="v">—</div>
                    <div className="l">{m.label}</div>
                    <div className="nt">too early to tell</div>
                  </div>
                );
              }
              return (
                <div key={m.key} className="rc-mstep">
                  <div className="v">{stat.reached}</div>
                  <div className="l">{m.label}</div>
                  <div className="p">{pct(stat.reached, stat.measurable)}</div>
                  <div className="nt">of {stat.measurable} measurable</div>
                </div>
              );
            })}
          </div>

          <div className="rc-bar" style={{ marginTop: 14 }}>
            {costFields.map((f) => (
              <span key={f.id} className="rc-stage">
                <b>{money(byCat[f.id])}</b> {f.label}
                {f.type === "overhead" ? " · monthly" : ""}
              </span>
            ))}
          </div>

          <div className="rc-sech">Month by month</div>
          <div className="rc-tablewrap">
            <div className="rc-table">
              <div className="rc-row head" style={{ gridTemplateColumns: "1.2fr .7fr 1fr .7fr .7fr .7fr" }}>
                <span>Month</span>
                <span>Classes</span>
                <span>Cost</span>
                <span>Hired</span>
                <span>Started</span>
                <span>Here</span>
              </div>
              {sel
                .slice()
                .sort()
                .reverse()
                .map((mk) => {
                  const list = byMonth[mk] || [];
                  const cost =
                    list.reduce((sum, c) => sum + classCost(c, classes, peopleByClass, overhead, costFields), 0) ||
                    overheadFields(costFields).reduce((sum, f) => sum + Number((overhead[mk] || {})[f.id] || 0), 0);
                  const s = list.reduce(
                    (acc, c) => {
                      const st = classStats(peopleByClass[c.id] || [], reasons);
                      return {
                        hired: acc.hired + st.hired,
                        started: acc.started + st.started,
                        active: acc.active + st.active,
                      };
                    },
                    { hired: 0, started: 0, active: 0 }
                  );
                  return (
                    <div key={mk} className="rc-row" style={{ gridTemplateColumns: "1.2fr .7fr 1fr .7fr .7fr .7fr" }}>
                      <span>{monthLabel(mk)}</span>
                      <span>{list.length}</span>
                      <span>{money(cost)}</span>
                      <span className="n">{s.hired}</span>
                      <span>{s.started}</span>
                      <span>{s.active}</span>
                    </div>
                  );
                })}
            </div>
          </div>
          <p className="rc-note" style={{ marginTop: 8 }}>
            A month with overhead entered but no hires still shows its cost — it just can't be split across
            classes.
          </p>
        </>
      )}
    </>
  );
}
