// Shared constants for the recruiting side (v2). The referral funnel in
// lib/constants.js is untouched — this is a separate track that runs alongside
// it, per locked decision #4 in the build spec.

// The interview pipeline. These four are the columns people move through;
// on hold and rejected sit off to the side.
export const CANDIDATE_STAGES = ["interviewing", "offer_extended", "offer_accepted", "hired"];
export const CANDIDATE_SIDE_STAGES = ["on_hold", "rejected"];
export const ALL_CANDIDATE_STAGES = [...CANDIDATE_STAGES, ...CANDIDATE_SIDE_STAGES];

export const STAGE_LABEL = {
  interviewing: "Interviewing",
  offer_extended: "Offer extended",
  offer_accepted: "Offer accepted",
  hired: "Hired",
  on_hold: "On hold",
  rejected: "Rejected",
};

export const INTERVIEW_TYPES = ["phone", "video", "in_person"];

export const INTERVIEW_LABEL = {
  phone: "Phone",
  video: "Video",
  in_person: "In-person",
};

export const CANDIDATE_SOURCES = ["job-board", "referral", "other"];

// Scorecard forms are built per department, per role, per interview type — a
// phone screen for a Solar Advisor asks different things than an in-person for
// a Field Marketer. A section holds any mix of item types.
export const ITEM_TYPES = ["graded", "yesno", "note"];

export const ITEM_LABEL = {
  graded: "Graded 1–10",
  yesno: "Yes / No",
  note: "Note",
};

// Department and role names carry spaces and slashes, neither of which belongs
// in a document id, so each part is slugged before it's joined.
export function formKey(dept, role, ivType) {
  const slug = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${slug(dept)}__${slug(role)}__${slug(ivType)}`;
}

// Build the record of a finished interview from the form as it stands right
// now plus what the interviewer entered. This is a snapshot on purpose: once
// it's saved, editing the form must never rewrite what someone was scored on.
export function buildScorecard(form, responses) {
  const answers = responses || {};
  const scores = [];
  let qualsTotal = 0;
  let qualsMet = 0;

  const sections = (form.sections || []).map((s) => ({
    label: s.label || "",
    items: (s.items || []).map((it) => {
      const given = answers[it.id] || {};
      if (it.type === "graded") {
        const raw = Number(given.score);
        const score = Number.isFinite(raw) && raw >= 1 && raw <= 10 ? Math.round(raw) : null;
        if (score != null) scores.push(score);
        return { type: "graded", text: it.text || "", score, note: String(given.note || "").trim() };
      }
      if (it.type === "yesno") {
        const answer = given.answer === "yes" || given.answer === "no" ? given.answer : null;
        qualsTotal += 1;
        if (answer === "yes") qualsMet += 1;
        return { type: "yesno", text: it.text || "", answer };
      }
      return { type: "note", text: it.text || "", note: String(given.note || "").trim() };
    }),
  }));

  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return { sections, avg, qualsMet, qualsTotal };
}

// Sub-roles per department. Editable in config/roles without a deploy, the
// same way config/scoring works on the referral side — these are the defaults
// it falls back to. Keys are the department names from lib/constants.js.
export const DEFAULT_ROLES = {
  Sales: ["Solar Advisor", "Assistant Manager", "Manager"],
  "Field Marketing": ["Field Marketer", "Team Lead", "Regional Manager"],
  "Contact Center": ["Agent", "Supervisor", "Call Center Manager", "Dialer Manager"],
  Installations: ["Installer"],
  "Site Survey": ["Site Surveyor"],
  "Project Coordination": ["Project Coordinator"],
  Accounting: ["Accountant"],
  Finance: ["Finance Analyst"],
  HR: ["HR Generalist"],
  Recruiting: ["Recruiter"],
  "Customer Concierge": ["Concierge Rep"],
};

export async function getRoles(db) {
  const snap = await db.collection("config").doc("roles").get();
  return snap.exists ? { ...DEFAULT_ROLES, ...snap.data() } : DEFAULT_ROLES;
}

export function rolesFor(roles, dept) {
  return roles[dept] || [];
}

// "YYYY-MM-DD" — the only date shape stored anywhere on this side, matching
// how the referral side stores start dates so the cron reads them unchanged.
export function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

// Is this candidate the same person an employee already referred? Keyed on the
// 10-digit mobile number, the same identity the referral side uses for
// duplicates. Exactly one match links; none or several link nothing — a guess
// here would eventually pay the wrong employee, so ambiguity stays a human's
// problem (build spec §6.3).
export async function matchReferral(db, key) {
  if (!key || key.length !== 10) return { matches: 0, referral: null };
  const snap = await db.collection("referrals").where("phoneKey", "==", key).get();
  if (snap.size !== 1) return { matches: snap.size, referral: null };
  const doc = snap.docs[0];
  return { matches: 1, referral: { id: doc.id, ...doc.data() } };
}

// The referrer's department is read fresh from their user record rather than
// the copy stored on the referral, because people change departments — the
// same rule the referral side's manager screens follow.
export async function referrerDepts(db, uids) {
  const wanted = [...new Set(uids.filter(Boolean))];
  if (!wanted.length) return {};
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  const out = {};
  snaps.forEach((s) => {
    if (s.exists) out[s.id] = s.data().dept || "";
  });
  return out;
}

// Seats are worked out from the candidates pointing at a class, never stored,
// so the count can't drift away from reality.
export function seatState(candidates, target) {
  const live = candidates.filter((c) => c.stage !== "rejected");
  const hired = live.filter((c) => c.stage === "hired").length;
  const pending = live.filter((c) => c.stage !== "hired").length;
  return { hired, pending, open: Math.max(0, (target || 0) - hired - pending) };
}
