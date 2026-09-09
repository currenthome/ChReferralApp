"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import { funnelRates, daysBetween, monthLabel, money } from "@/lib/reporting";

function monthsFrom(fromYmd, toYmd) {
  const list = [];
  let [y, m] = fromYmd.slice(0, 7).split("-").map(Number);
  const [ey, em] = toYmd.slice(0, 7).split("-").map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 60) {
    list.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return list;
}

// Work a headcount goal backwards through what actually happened before:
// how many applicants it took, how many made it through each step, and what
// it cost.
export default function Forecast() {
  const { profile } = useAuth();
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState("");
  const [dept, setDept] = useState("all");
  const [current, setCurrent] = useState(50);
  const [target, setTarget] = useState(75);
  const [byDate, setByDate] = useState("");
  const [attrition, setAttrition] = useState("");

  useEffect(() => {
    if (!profile?.v2Visible) return;
    api("/api/recruiting/reports")
      .then((d) => {
        setRaw(d);
        if (!byDate) {
          const dt = new Date(`${d.today}T12:00:00Z`);
          dt.setUTCMonth(dt.getUTCMonth() + 6);
          setByDate(dt.toISOString().slice(0, 10));
        }
      })
      .catch((e) => setErr(e.message));
    // byDate is seeded once from the server's idea of today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (profile?.v2Access === "dept-manager" && profile.dept) setDept(profile.dept);
  }, [profile]);

  const allDepts = profile?.v2Access !== "dept-manager";

  const scoped = useMemo(() => {
    if (!raw) return null;
    const classes = raw.classes.filter((c) => dept === "all" || c.dept === dept);
    return { ...raw, classes };
  }, [raw, dept]);

  const rates = useMemo(
    () =>
      scoped
        ? funnelRates(scoped.classes, scoped.peopleByClass, scoped.overhead, scoped.costFields, scoped.today)
        : null,
    [scoped]
  );

  if (!raw && !err) {
    return (
      <Shell wide nav={false}>
        <V2Guard>
          <div className="spinner">Loading…</div>
        </V2Guard>
      </Shell>
    );
  }

  const scopeLabel = dept === "all" ? "company-wide history" : `${dept} history`;
  const months = byDate && raw ? daysBetween(raw.today, byDate) / 30.44 : 0;
  const attrDefault = rates?.monthlyAttrition || 0;
  const attr = attrition !== "" ? (parseFloat(attrition) || 0) / 100 : attrDefault;

  const netGrowth = Math.max(0, Number(target) - Number(current));
  const avgHead = (Number(current) + Number(target)) / 2;
  const departures = Math.round(avgHead * attr * Math.max(0, months));
  const startsNeeded = netGrowth + departures;
  const hires = rates?.hireToStart > 0 ? Math.ceil(startsNeeded / rates.hireToStart) : startsNeeded;
  const interviews = rates?.ivToHire > 0 ? Math.ceil(hires / rates.ivToHire) : 0;
  const prescreens = rates?.preToIv > 0 ? Math.ceil(interviews / rates.preToIv) : 0;
  const applicants = rates?.appToPre > 0 ? Math.ceil(prescreens / rates.appToPre) : 0;
  const adSpend = Math.round(applicants * (rates?.adPerApplicant || 0));
  const totalCost = Math.round(hires * (rates?.costPerHire || 0));

  const ramp = raw && byDate && months > 0 ? monthsFrom(raw.today, byDate) : [];
  const perMonth = ramp.length || 1;

  return (
    <Shell wide nav={false}>
      <V2Guard>
        <h1>Forecast</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Set a headcount goal and a date. Using your {scopeLabel}, this works backwards to the applicants,
          prescreens, interviews, and ad spend it would take.
        </p>
        {err && <div className="toast warn">{err}</div>}

        <div className="rc-sech">The goal</div>
        <div className="rc-inputs">
          <div>
            <label>Department</label>
            <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={!allDepts}>
              <option value="all">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Team size now</label>
            <input inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
          <div>
            <label>Team size wanted</label>
            <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
          <div>
            <label>By when</label>
            <input type="date" value={byDate} onChange={(e) => setByDate(e.target.value)} />
          </div>
        </div>

        {!rates?.hasData ? (
          <p className="rc-note" style={{ marginTop: 20 }}>
            Not enough history for {scopeLabel} yet. Enter the applicant numbers for past classes on the
            Reports screen, or pick a different department.
          </p>
        ) : months <= 0 ? (
          <p className="rc-note" style={{ marginTop: 20 }}>Pick a date in the future.</p>
        ) : (
          <>
            <div className="rc-inputs" style={{ maxWidth: 280, marginTop: 12 }}>
              <div>
                <label>Expected monthly attrition %</label>
                <input
                  inputMode="decimal"
                  value={attrition !== "" ? attrition : (attrDefault * 100).toFixed(1)}
                  onChange={(e) => setAttrition(e.target.value)}
                />
                <div className="rc-hint">From your history: {(attrDefault * 100).toFixed(1)}% a month</div>
              </div>
            </div>

            <div className="rc-oh" style={{ marginTop: 16 }}>
              Grow <b>{dept === "all" ? "the company" : dept}</b> from <b>{current}</b> to <b>{target}</b> by{" "}
              <b>{byDate}</b> — about <b>{months.toFixed(1)} months</b>. That's <b>+{netGrowth}</b> net, plus
              roughly <b>{departures}</b> people expected to leave and need replacing ={" "}
              <b>{startsNeeded} new starts</b>.
            </div>

            <div className="rc-sech">What that takes</div>
            <div className="rc-mile">
              <div className="rc-mstep">
                <div className="v" style={{ fontSize: 17 }}>{money(adSpend)}</div>
                <div className="l">Ad spend</div>
                <div className="nt">to assume</div>
              </div>
              <div className="rc-mstep">
                <div className="v">{applicants.toLocaleString()}</div>
                <div className="l">Applicants</div>
                <div className="nt">{(rates.appToPre * 100).toFixed(0)}% get a prescreen</div>
              </div>
              <div className="rc-mstep">
                <div className="v">{prescreens.toLocaleString()}</div>
                <div className="l">Prescreens</div>
                <div className="nt">{(rates.preToIv * 100).toFixed(0)}% reach an interview</div>
              </div>
              <div className="rc-mstep">
                <div className="v">{interviews.toLocaleString()}</div>
                <div className="l">Interviews</div>
                <div className="nt">{(rates.ivToHire * 100).toFixed(0)}% get hired</div>
              </div>
              <div className="rc-mstep">
                <div className="v">{hires.toLocaleString()}</div>
                <div className="l">Hires</div>
                <div className="nt">{(rates.hireToStart * 100).toFixed(0)}% actually start</div>
              </div>
              <div className="rc-mstep" style={{ borderColor: "var(--cyan)", background: "var(--cyanlight)" }}>
                <div className="v">{startsNeeded.toLocaleString()}</div>
                <div className="l">New starts</div>
                <div className="nt">on the team</div>
              </div>
            </div>

            <div className="rc-cards" style={{ marginTop: 14 }}>
              <div className="rc-card">
                <div className="l">Ad spend to assume</div>
                <div className="v">{money(adSpend)}</div>
              </div>
              <div className="rc-card good">
                <div className="l">Total estimated cost</div>
                <div className="v">{money(totalCost)}</div>
              </div>
              <div className="rc-card">
                <div className="l">Applicants a month</div>
                <div className="v">{Math.ceil(applicants / perMonth).toLocaleString()}</div>
              </div>
              <div className="rc-card">
                <div className="l">Hires a month</div>
                <div className="v">{(hires / perMonth).toFixed(1)}</div>
              </div>
            </div>

            <div className="rc-sech">
              Month by month<span className="sub">spread evenly to land on the date</span>
            </div>
            <div className="rc-tablewrap">
              <div className="rc-table">
                <div className="rc-row head" style={{ gridTemplateColumns: "1.1fr .9fr .9fr .9fr .7fr .7fr 1fr .9fr" }}>
                  <span>Month</span>
                  <span>Applicants</span>
                  <span>Prescreens</span>
                  <span>Interviews</span>
                  <span>Hires</span>
                  <span>Starts</span>
                  <span>Ad spend</span>
                  <span>Team size</span>
                </div>
                {ramp.map((mk, i) => (
                  <div key={mk} className="rc-row" style={{ gridTemplateColumns: "1.1fr .9fr .9fr .9fr .7fr .7fr 1fr .9fr" }}>
                    <span>{monthLabel(mk)}</span>
                    <span>{Math.round(applicants / perMonth).toLocaleString()}</span>
                    <span>{Math.round(prescreens / perMonth)}</span>
                    <span>{Math.round(interviews / perMonth)}</span>
                    <span>{Math.round(hires / perMonth)}</span>
                    <span>{Math.round(startsNeeded / perMonth)}</span>
                    <span>{money(adSpend / perMonth)}</span>
                    <span className="n">{Math.round(Number(current) + (netGrowth / perMonth) * (i + 1))}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="rc-note" style={{ marginTop: 10 }}>
              Volume is spread evenly across {perMonth} month{perMonth > 1 ? "s" : ""}. It doesn't account for
              the lag between finding someone and them starting, so treat the first month or two as a
              run-up.
            </p>
            <p className="rc-note" style={{ marginTop: 10 }}>
              Based on {scopeLabel} — {rates.classes} classes, {rates.applicants.toLocaleString()} applicants,{" "}
              {rates.hired} hires, {money(rates.adPerApplicant)} of ad spend per applicant, {money(rates.costPerHire)}{" "}
              all in per hire. Change the attrition figure to see a better or worse case.
            </p>
          </>
        )}
      </V2Guard>
    </Shell>
  );
}
