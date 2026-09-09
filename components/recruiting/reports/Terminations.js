"use client";

import { useState } from "react";
import { collectTerms, daysBetween, monthLabel, monthOf, pct, tenureDays } from "@/lib/reporting";
import { fmtDate } from "../ui";

const RANGES = [
  { id: "all", label: "All time" },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "180", label: "Last 6 months", days: 180 },
  { id: "365", label: "Last 12 months", days: 365 },
];

function tenureLabel(d) {
  return d >= 60 ? `${d} days (~${Math.round(d / 30)} months)` : `${d} days`;
}

function daysAgo(today, n) {
  const dt = new Date(`${today}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

// Who has left, when, and why.
export default function Terminations({ data, onEditReasons }) {
  const { classes, peopleByClass, reasons, today, scopeDept } = data;
  const [rangeId, setRangeId] = useState("all");

  const { terms, started, active, noShow } = collectTerms(classes, peopleByClass, today);
  const range = RANGES.find((r) => r.id === rangeId);
  const from = range.days ? daysAgo(today, range.days) : null;
  const inRange = terms.filter((t) => !from || t.terminationDate >= from);

  const avgTenure = inRange.length
    ? Math.round(inRange.reduce((s, t) => s + t.tenure, 0) / inRange.length)
    : 0;

  const first = terms.map((t) => t.terminationDate).sort()[0];
  const spanMonths = Math.max(1, Math.round(daysBetween(from || first || today, today) / 30.44));

  const byReason = {};
  inRange.forEach((t) => {
    const label = reasons.find((r) => r.id === t.termReasonId)?.label || "Unspecified";
    const b = (byReason[label] = byReason[label] || { count: 0, tenure: 0 });
    b.count += 1;
    b.tenure += t.tenure;
  });

  const byDept = {};
  inRange.forEach((t) => (byDept[t.dept] = (byDept[t.dept] || 0) + 1));

  // Churn per class, over that class's whole life — not affected by the filter.
  const cohorts = classes
    .map((c) => {
      const people = (peopleByClass[c.id] || []).filter((p) => p.started);
      const gone = people.filter((p) => p.terminationDate);
      return {
        cls: c,
        started: people.length,
        gone: gone.length,
        churn: people.length ? gone.length / people.length : 0,
        avgTenure: gone.length
          ? Math.round(gone.reduce((s, p) => s + (tenureDays(p, today) || 0), 0) / gone.length)
          : 0,
      };
    })
    .filter((c) => c.started > 0)
    .sort((a, b) => b.churn - a.churn);

  return (
    <>
      <div className="rc-bar">
        {RANGES.map((r) => (
          <button
            key={r.id}
            className="rc-chip"
            onClick={() => setRangeId(r.id)}
            style={
              rangeId === r.id
                ? { background: "var(--charcoal)", color: "#fff", borderColor: "var(--charcoal)", fontWeight: 700 }
                : undefined
            }
          >
            {r.label}
          </button>
        ))}
        <span className="grow" />
        {onEditReasons && (
          <button className="rc-btnsm ghost" onClick={onEditReasons}>
            Edit reasons
          </button>
        )}
      </div>

      <div className="rc-cards">
        <div className="rc-card bad">
          <div className="l">People who left</div>
          <div className="v">
            {inRange.length}
            <span className="u">
              {" "}
              · {rangeId === "all" ? `${pct(inRange.length, started)} of all hires` : range.label.toLowerCase()}
            </span>
          </div>
        </div>
        {spanMonths > 1 && (
          <div className="rc-card">
            <div className="l">Per month</div>
            <div className="v">{(inRange.length / spanMonths).toFixed(1)}</div>
          </div>
        )}
        <div className="rc-card">
          <div className="l">Average time before leaving</div>
          <div className="v" style={{ fontSize: 16 }}>
            {inRange.length ? tenureLabel(avgTenure) : "—"}
          </div>
        </div>
        <div className="rc-card good">
          <div className="l">Still here</div>
          <div className="v">
            {active}
            <span className="u"> all time</span>
          </div>
        </div>
      </div>

      <p className="rc-note" style={{ marginTop: 10 }}>
        All time: <b>{started}</b> people started, <b>{active}</b> are still here, <b>{noShow}</b> never showed
        up. The figures above cover people who left within {range.label.toLowerCase()}.
      </p>

      <div className="rc-sech">Why they left</div>
      {Object.keys(byReason).length ? (
        <div className="rc-tablewrap">
          <div className="rc-table">
            <div className="rc-row head" style={{ gridTemplateColumns: "1.4fr .7fr .8fr 1.1fr" }}>
              <span>Reason</span>
              <span>People</span>
              <span>Share</span>
              <span>Average time</span>
            </div>
            {Object.entries(byReason)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([label, b]) => (
                <div key={label} className="rc-row" style={{ gridTemplateColumns: "1.4fr .7fr .8fr 1.1fr" }}>
                  <span>{label}</span>
                  <span className="n">{b.count}</span>
                  <span>{pct(b.count, inRange.length)}</span>
                  <span>{tenureLabel(Math.round(b.tenure / b.count))}</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <p className="rc-note">Nobody left in that window.</p>
      )}

      {!scopeDept && Object.keys(byDept).length > 1 && (
        <>
          <div className="rc-sech">By department</div>
          <div className="rc-bar" style={{ marginBottom: 0 }}>
            {Object.entries(byDept)
              .sort((a, b) => b[1] - a[1])
              .map(([d, n]) => (
                <span key={d} className="rc-stage">
                  <b>{n}</b> {d}
                </span>
              ))}
          </div>
        </>
      )}

      <div className="rc-sech">
        By class<span className="sub">whole life of each class, worst first — the date filter doesn't apply</span>
      </div>
      <div className="rc-tablewrap">
        <div className="rc-table">
          <div className="rc-row head" style={{ gridTemplateColumns: "1.6fr .7fr .7fr 1fr 1fr" }}>
            <span>Class</span>
            <span>Started</span>
            <span>Left</span>
            <span>Turnover</span>
            <span>Average time</span>
          </div>
          {cohorts.map((c) => {
            const p = Math.round(c.churn * 100);
            return (
              <div key={c.cls.id} className="rc-row" style={{ gridTemplateColumns: "1.6fr .7fr .7fr 1fr 1fr" }}>
                <span>
                  {monthLabel(monthOf(c.cls.date))} · {c.cls.role}
                </span>
                <span>{c.started}</span>
                <span className="n">{c.gone}</span>
                <span>
                  <span className="rc-bars">
                    <span style={{ width: `${p}%` }} />
                  </span>
                  {p}%
                </span>
                <span>{c.gone ? tenureLabel(c.avgTenure) : "—"}</span>
              </div>
            );
          })}
          {!cohorts.length && (
            <div className="rc-empty" style={{ padding: 14 }}>
              No classes with anyone started yet.
            </div>
          )}
        </div>
      </div>

      {inRange.length > 0 && (
        <>
          <div className="rc-sech">Everyone who left</div>
          <div className="rc-tablewrap">
            <div className="rc-table">
              <div className="rc-row head" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}>
                <span>Name</span>
                <span>Left</span>
                <span>Reason</span>
                <span>Time here</span>
              </div>
              {inRange
                .slice()
                .sort((a, b) => b.terminationDate.localeCompare(a.terminationDate))
                .map((t) => (
                  <div key={t.id} className="rc-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}>
                    <span>
                      {t.name}
                      <span className="tn"> · {t.role}</span>
                    </span>
                    <span>{fmtDate(t.terminationDate).full}</span>
                    <span>{reasons.find((r) => r.id === t.termReasonId)?.label || "Unspecified"}</span>
                    <span>{tenureLabel(t.tenure)}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      <p className="rc-note" style={{ marginTop: 16 }}>
        The reasons list is yours to shape. As the team runs into new ones,{" "}
        {onEditReasons ? "hit Edit reasons to add them" : "ask an executive to add them"} — they show up the
        moment someone's separation date gets set.
      </p>
    </>
  );
}
