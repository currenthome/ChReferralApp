// The recruiting reports: what a class cost, who stayed, who left and why.
//
// All the arithmetic lives here so the server and the screens can't drift into
// two different answers. Nothing in this file reads or writes anything — hand
// it classes and their people and it works out the numbers.

import { COMPANY_TZ } from "./constants.js";

// Cost categories are editable, so these are only the starting set.
// "direct" is entered on a class; "overhead" is a monthly pool that gets
// spread across that month's classes by how many people each one hired.
export const DEFAULT_COST_FIELDS = [
  { id: "ad", label: "Ad spend", type: "direct" },
  { id: "referral", label: "Referral fees", type: "direct" },
  { id: "payroll", label: "Payroll", type: "overhead" },
  { id: "tools", label: "Tools", type: "overhead" },
];

// Placeholders on purpose — the team adds real ones as they come up.
export const DEFAULT_REASONS = [
  { id: "quit", label: "Quit" },
  { id: "dismissed", label: "Dismissed" },
  { id: "no_call", label: "No call / no show" },
  { id: "better_offer", label: "Took another offer" },
];

export const RETENTION_MILESTONES = [
  { key: "d30", label: "30 days", days: 30 },
  { key: "d60", label: "60 days", days: 60 },
  { key: "d90", label: "90 days", days: 90 },
  { key: "d180", label: "180 days", days: 180 },
  { key: "d365", label: "1 year", days: 365 },
];

// Company time, not the browser's or the server's — a class that starts today
// in California shouldn't read as tomorrow to someone in Florida. The daily
// cron keeps its own copy of this; leaving that alone is deliberate.
export function todayCompanyDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function daysBetween(from, to) {
  if (!from || !to) return 0;
  return Math.floor((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000);
}

export function monthOf(ymd) {
  return String(ymd || "").slice(0, 7);
}

export function monthLabel(mk) {
  const [y, m] = String(mk || "").split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(m, 10) - 1] || "?"} ${y}`;
}

export function money(n) {
  return `$${Math.round(n || 0).toLocaleString()}`;
}

export function pct(n, d) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

// Days on the job, counted from this person's own first day — not their
// class's date (decision 3A.2). Still counting if they haven't left.
export function tenureDays(person, today) {
  if (!person.startDate || !person.started) return null;
  return Math.max(0, daysBetween(person.startDate, person.terminationDate || today));
}

// A milestone can only be judged once there's been enough calendar time, or
// once the person has left. Someone hired last week is not a 1-year failure.
export function personMilestone(person, days, today) {
  const tenure = tenureDays(person, today);
  if (tenure == null) return { measurable: false, reached: false };
  const elapsed = daysBetween(person.startDate, today);
  const measurable = !!person.terminationDate || elapsed >= days;
  return { measurable, reached: measurable && tenure >= days };
}

export function milestoneStat(people, days, today) {
  let reached = 0;
  let measurable = 0;
  people.forEach((p) => {
    const m = personMilestone(p, days, today);
    if (m.measurable) {
      measurable += 1;
      if (m.reached) reached += 1;
    }
  });
  return { reached, measurable, notYet: people.length - measurable };
}

// How a class turned out. "hired" counts everyone given an offer they
// accepted, including anyone who then never showed up — that's what a no-show
// is, and it still cost money to get them.
export function classStats(people, reasons) {
  const started = people.filter((p) => p.started);
  const byReason = {};
  people.forEach((p) => {
    if (p.terminationDate || !p.started) {
      const found = reasons.find((r) => r.id === p.termReasonId);
      const label = found ? found.label : "Unspecified";
      byReason[label] = (byReason[label] || 0) + 1;
    }
  });
  return {
    hired: people.length,
    started: started.length,
    graduated: people.filter((p) => p.graduated).length,
    active: started.filter((p) => !p.terminationDate).length,
    separated: started.filter((p) => p.terminationDate).length,
    noShow: people.filter((p) => !p.started).length,
    byReason,
  };
}

export function directFields(fields) {
  return fields.filter((f) => f.type === "direct");
}

export function overheadFields(fields) {
  return fields.filter((f) => f.type === "overhead");
}

export function classDirect(cls, fields) {
  return directFields(fields).reduce((sum, f) => sum + Number(cls.costs?.[f.id] || 0), 0);
}

// Everyone hired that month, across every class in it — the denominator for
// splitting the month's overhead.
export function monthHires(classes, peopleByClass, mk) {
  return classes
    .filter((c) => monthOf(c.date) === mk)
    .reduce((n, c) => n + (peopleByClass[c.id]?.length || 0), 0);
}

// A class's slice of its month's overhead: its share of that month's hires.
// The shares add up to the whole pool, so nothing goes missing or gets
// counted twice. A month with no hires can't allocate anything.
export function classOverhead(cls, classes, peopleByClass, overhead, fields) {
  const mk = monthOf(cls.date);
  const pool = overhead[mk] || {};
  const total = monthHires(classes, peopleByClass, mk);
  const mine = peopleByClass[cls.id]?.length || 0;
  const share = total > 0 ? mine / total : 0;
  return overheadFields(fields).reduce((sum, f) => sum + Number(pool[f.id] || 0) * share, 0);
}

export function classCost(cls, classes, peopleByClass, overhead, fields) {
  return (
    classDirect(cls, fields) + classOverhead(cls, classes, peopleByClass, overhead, fields)
  );
}

// Applicant through to a year on the job, with the drop at every step.
export function classJourney(cls, people, today, reasons) {
  const s = classStats(people, reasons);
  const f = cls.funnel || {};
  const stages = [
    { label: "Applicants", count: Number(f.applicants || 0), of: null, phase: "acq" },
    { label: "Prescreens", count: Number(f.prescreens || 0), of: Number(f.applicants || 0), phase: "acq" },
    { label: "Interviews", count: Number(f.interviewed || 0), of: Number(f.prescreens || 0), phase: "acq" },
    { label: "Hired", count: s.hired, of: Number(f.interviewed || 0), phase: "acq" },
    { label: "Started", count: s.started, of: s.hired, phase: "ret" },
    { label: "Graduated", count: s.graduated, of: s.started, phase: "ret" },
  ];

  const startedPeople = people.filter((p) => p.started);
  let prev = s.started;
  RETENTION_MILESTONES.forEach((m) => {
    const stat = milestoneStat(startedPeople, m.days, today);
    const notYet = stat.measurable === 0;
    stages.push({
      label: m.label,
      count: notYet ? null : stat.reached,
      of: prev,
      notYet,
      phase: "ret",
    });
    if (!notYet) prev = stat.reached;
  });
  return stages;
}

// Everyone who has left, for the terminations report.
export function collectTerms(classes, peopleByClass, today) {
  const terms = [];
  let started = 0;
  let active = 0;
  let noShow = 0;
  classes.forEach((cls) => {
    (peopleByClass[cls.id] || []).forEach((p) => {
      if (!p.started) {
        noShow += 1;
        return;
      }
      started += 1;
      if (p.terminationDate) {
        terms.push({
          id: p.id,
          name: p.name,
          dept: cls.dept,
          role: cls.role,
          classId: cls.id,
          month: monthOf(cls.date),
          termReasonId: p.termReasonId || null,
          terminationDate: p.terminationDate,
          tenure: tenureDays(p, today) || 0,
        });
      } else {
        active += 1;
      }
    });
  });
  return { terms, started, active, noShow };
}

// Historical conversion and cost, used to work a headcount goal backwards.
export function funnelRates(classes, peopleByClass, overhead, fields, today) {
  let applicants = 0;
  let prescreens = 0;
  let interviews = 0;
  let hired = 0;
  let started = 0;
  let adSpend = 0;
  let totalCost = 0;
  let terms = 0;
  let personMonths = 0;

  classes.forEach((cls) => {
    const people = peopleByClass[cls.id] || [];
    const f = cls.funnel || {};
    applicants += Number(f.applicants || 0);
    prescreens += Number(f.prescreens || 0);
    interviews += Number(f.interviewed || 0);
    hired += people.length;
    started += people.filter((p) => p.started).length;
    adSpend += Number(cls.costs?.ad || 0);
    totalCost += classCost(cls, classes, peopleByClass, overhead, fields);
    people.forEach((p) => {
      if (!p.started) return;
      if (p.terminationDate) terms += 1;
      personMonths += (tenureDays(p, today) || 0) / 30.44;
    });
  });

  return {
    classes: classes.length,
    applicants,
    prescreens,
    interviews,
    hired,
    started,
    appToPre: applicants ? prescreens / applicants : 0,
    preToIv: prescreens ? interviews / prescreens : 0,
    ivToHire: interviews ? hired / interviews : 0,
    hireToStart: hired ? started / hired : 0,
    adPerApplicant: applicants ? adSpend / applicants : 0,
    costPerHire: hired ? totalCost / hired : 0,
    monthlyAttrition: personMonths ? terms / personMonths : 0,
    hasData: applicants > 0 && hired > 0 && started > 0,
  };
}
