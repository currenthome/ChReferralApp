// Shared constants — single source of truth for funnel stages, departments, scoring defaults.

export const STAGES = [
  "Submitted",
  "Brief completed",
  "Contacted",
  "Pre-screen",
  "Interviewed",
  "Offer made",
  "Hired",
];

export const HIRED_STAGE = STAGES.length - 1;

export const DEPARTMENTS = [
  "Sales",
  "Field Marketing",
  "Contact Center",
  "Installations",
  "Site Survey",
  "Project Coordination",
  "Accounting",
  "Finance",
  "HR",
  "Recruiting",
  "Customer Concierge",
];

// Default scoring config, editable by managers in /manage/scoring.
// Points credit to the month the milestone is achieved (company timezone).
export const DEFAULT_SCORING = {
  submit: { label: "Submit", pts: 5, cash: 0 },
  start: { label: "Start Date", pts: 50, cash: 0 },
  day30: { label: "Day 30", pts: 100, cash: 0, days: 30 },
  // Manager-added retention milestones, e.g. { id, name: "Day 90", days: 90, pts, cash }
  custom: [],
};

export const COMPANY_TZ = "America/Los_Angeles";

// Distros that track payout obligations — emailed on hire and at Day 30.
export const MILESTONE_DISTROS = [
  "payroll@currenthome.com",
  "recruiting@currenthome.com",
  "skip@currenthome.com",
];

// Normalize any phone input to its 10-digit key. Duplicate detection and
// first-submission-wins both key off this value.
export function phoneKey(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatPhone(raw) {
  const d = phoneKey(raw);
  if (d.length !== 10) return raw || "";
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// "YYYY-MM" for a date in company time — the month a milestone's points belong to.
export function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}
