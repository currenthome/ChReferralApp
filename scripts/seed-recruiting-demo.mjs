// Demo data for Skip's UAT of the recruiting side.
// Usage: node scripts/seed-recruiting-demo.mjs
//
// Everything written here carries demo: true and is removed by the exec-only
// purge in the app (Recruiting → Purge demo data), or by running this with
// `purge`. Real records are never touched.
//
// Dates are worked out from today, not hard-coded, so the reports look alive
// whenever this is run: classes stretching back a year for the look-back and
// retention marks, plus a few upcoming ones to fill.
import { readFileSync } from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const raw = env.FIREBASE_SERVICE_ACCOUNT;
const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(json)) });
const db = getFirestore(app);

const mode = process.argv[2] || "seed";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TODAY = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
};
const now = () => new Date().toISOString();

// Demo phones all sit in the 555-01xx range so they can't collide with a real
// person, and every one is checked against the real referrals before writing.
let phoneSeq = 0;
const nextPhone = () => `(951) 555-${String(1200 + phoneSeq++).padStart(4, "0")}`;
const phoneKey = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};
const formatPhone = (raw) => {
  const d = phoneKey(raw);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
};

const NAMES = [
  "Aaron Keeler", "Bella Marsh", "Cody Rowe", "Dana Lyle", "Eli Trent", "Faith Nunez",
  "Gio Palmer", "Hana Sato", "Ivan Duke", "Jade Wren", "Kurt Baines", "Lena Frost",
  "Milo Grant", "Nora Vale", "Omar Pratt", "Pia Cortez", "Quinn Abbott", "Rosa Ellis",
  "Sean Ortiz", "Tara Judd", "Uma Reyes", "Vince Lowry", "Wren Tate", "Xena Booker",
  "Yara Mills", "Zane Poole", "Cole Deane", "Nina Fisk", "Rhea Sims", "Todd Mabry",
  "Gwen Locke", "Hugo Reyna", "Iris Calder", "Jonah Beck", "Kira Nolan", "Liam Stout",
  "Mara Vance", "Nico Bright", "Opal Reese", "Pete Sandoval", "Rae Whitman", "Sami Kohl",
  "Tess Arroyo", "Umi Nakata", "Vera Doss", "Wade Cutler", "Xavi Luna", "Yosef Adler",
  "Zora Pike", "Abel Cross", "Bree Hollis", "Cruz Medina", "Dax Whitfield", "Elle Barnes",
  "Finn Cortland", "Gaby Rios", "Hank Delgado", "Ivy Sorensen", "Jax Mercer", "Kai Ellison",
];
let nameSeq = 0;
const nextName = () => NAMES[nameSeq++ % NAMES.length];

// ---------------------------------------------------------------------------
// purge — used on its own, and before a re-seed so this stays repeatable
// ---------------------------------------------------------------------------
async function purge() {
  let removed = 0;
  for (const name of ["candidates", "classes", "scorecardForms", "v2Overhead", "referrals"]) {
    const snap = await db.collection(name).where("demo", "==", true).get();
    for (const doc of snap.docs) {
      // A candidate's interviews live underneath it and go with it.
      if (name === "candidates") {
        const ivs = await doc.ref.collection("interviews").get();
        for (const iv of ivs.docs) await iv.ref.delete();
      }
      await doc.ref.delete();
      removed += 1;
    }
    if (snap.size) console.log(`  ${name}: removed ${snap.size}`);
  }
  return removed;
}

if (mode === "purge") {
  const n = await purge();
  console.log(`purge done — ${n} demo records removed.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------
console.log("clearing any previous demo data first…");
await purge();

// Whoever runs this is the one shown as having added the demo records.
const usersSnap = await db.collection("users").get();
const actor =
  usersSnap.docs.find((d) => ["exec", "recruiter"].includes(d.data().v2Access)) ||
  usersSnap.docs.find((d) => d.data().role === "admin") ||
  usersSnap.docs[0];
if (!actor) {
  console.error("No users in the database yet — sign in to the app once, then re-run this.");
  process.exit(1);
}
const actorName = actor.data().name || actor.data().email;
console.log(`seeding as ${actorName}`);

// Guard: no demo phone may match a real referral, or hiring a demo candidate
// would advance somebody's real referral and email payroll (build spec §8).
const realKeys = new Set(
  (await db.collection("referrals").get()).docs
    .filter((d) => d.data().demo !== true)
    .map((d) => d.data().phoneKey)
);

// Departments, roles and locations mirror the prototype.
const PLAN = [
  // [dept, role, location, seats, dayOffset, hires, noShows, [[termDayOffset, reason], …]]
  ["Field Marketing", "Field Marketer", "Riverside Office", 10, -428, 9, 1, [[-80, "quit"], [-281, "better_offer"], [-379, "dismissed"]]],
  ["Contact Center", "Agent", "Remote / Phoenix", 12, -302, 10, 1, [[-116, "quit"], [-219, "quit"], [-262, "dismissed"]]],
  ["Contact Center", "Agent", "Remote / Phoenix", 12, -238, 7, 1, [[-146, "quit"], [-208, "dismissed"]]],
  ["Field Marketing", "Field Marketer", "Inland Empire", 10, -210, 6, 1, [[-130, "better_offer"], [-185, "dismissed"]]],
  ["Sales", "Solar Advisor", "San Diego HQ", 8, -190, 5, 1, [[-101, "quit"]]],
  ["Contact Center", "Agent", "Remote / Phoenix", 12, -154, 8, 1, [[-63, "quit"], [-108, "quit"]]],
  ["Field Marketing", "Field Marketer", "Orlando Office", 10, -126, 7, 2, [[-52, "better_offer"]]],
  ["Sales", "Solar Advisor", "San Diego HQ", 8, -98, 6, 1, [[-40, "quit"]]],
  ["Contact Center", "Agent", "Remote / Phoenix", 12, -63, 9, 2, [[-18, "dismissed"]]],
  ["Sales", "Solar Advisor", "San Diego HQ", 8, -35, 6, 0, []],
  // upcoming, still filling
  ["Field Marketing", "Field Marketer", "Riverside Office", 10, 11, 0, 0, []],
  ["Sales", "Solar Advisor", "San Diego HQ", 8, 18, 0, 0, []],
  ["Contact Center", "Agent", "Remote / Phoenix", 12, 26, 0, 0, []],
];

const FUNNEL = {
  "Field Marketer": { perSeat: 34, adShare: 0.7, preShare: 0.17, ivShare: 0.55 },
  "Solar Advisor": { perSeat: 22, adShare: 0.72, preShare: 0.23, ivShare: 0.58 },
  Agent: { perSeat: 36, adShare: 0.71, preShare: 0.21, ivShare: 0.55 },
};

const COSTS = {
  "Field Marketer": { ad: 4100 },
  "Solar Advisor": { ad: 5400 },
  Agent: { ad: 3700 },
};

let classCount = 0;
let candCount = 0;
let ivCount = 0;
const monthsTouched = new Set();

for (const [dept, role, location, target, dayOffset, hires, noShows, terms] of PLAN) {
  const date = shift(dayOffset);
  const past = dayOffset < 0;
  const f = FUNNEL[role];
  const seats = target;

  const classRef = db.collection("classes").doc();
  await classRef.set({
    dept,
    role,
    date,
    location,
    target,
    createdBy: actor.id,
    createdByName: actorName,
    createdAt: now(),
    demo: true,
    ...(past
      ? {
          funnel: {
            applicants: Math.round(seats * f.perSeat),
            adApplications: Math.round(seats * f.perSeat * f.adShare),
            prescreens: Math.round(seats * f.perSeat * f.preShare),
            interviewed: Math.round(seats * f.perSeat * f.preShare * f.ivShare),
          },
          costs: { ...COSTS[role], referral: (hires + noShows) * 150 },
        }
      : {}),
  });
  classCount += 1;
  if (past) monthsTouched.add(date.slice(0, 7));

  // People hired into this class. Past classes have their outcomes recorded;
  // upcoming ones get candidates part-way through interviewing instead.
  const termList = [...terms];
  const total = past ? hires + noShows : Math.min(seats, 4);

  for (let i = 0; i < total; i += 1) {
    const name = nextName();
    const phone = nextPhone();
    const key = phoneKey(phone);
    if (realKeys.has(key)) {
      console.error(`refusing to seed ${name}: ${phone} matches a real referral. Aborting.`);
      process.exit(1);
    }

    let stage = "interviewing";
    let startDate = null;
    let started;
    let graduated = false;
    let terminationDate = null;
    let termReasonId = null;

    if (past) {
      stage = "hired";
      // A couple of people start a week after their class, which is exactly
      // why each person carries their own first day.
      startDate = i % 5 === 0 ? shift(dayOffset + 7) : date;
      const isNoShow = i >= hires;
      started = !isNoShow;
      graduated = started && i % 6 !== 0;
      if (started && termList.length) {
        const [termOffset, reason] = termList.shift();
        terminationDate = shift(termOffset);
        termReasonId = reason;
      }
      if (isNoShow) termReasonId = "no_call";
    } else {
      // Upcoming class: a spread across the pipeline so the board looks real.
      stage = ["interviewing", "interviewing", "offer_extended", "offer_accepted"][i] || "interviewing";
      started = false;
    }

    const candRef = db.collection("candidates").doc();
    await candRef.set({
      name,
      phone: formatPhone(phone),
      phoneKey: key,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      dept,
      role,
      classId: classRef.id,
      stage,
      source: "job-board",
      referralId: null,
      referrerUid: null,
      referrerName: null,
      referralMatches: 0,
      resumeUrl: "",
      resumeName: "",
      prescreenNotes:
        i % 3 === 0
          ? "Prescreen — solid attitude, available for the full class, asked good questions about comp."
          : "Prescreen — some relevant experience, coachable, wants to start soon.",
      prescreenBy: actor.id,
      prescreenByName: actorName,
      prescreenAt: now(),
      startDate,
      started,
      graduated,
      terminationDate,
      termReasonId,
      createdAt: now(),
      createdBy: actor.id,
      createdByName: actorName,
      stageChangedAt: now(),
      demo: true,
    });
    candCount += 1;

    // A phone screen everyone gets, plus a second round for most.
    const ivDay = past ? dayOffset - 14 : dayOffset - 9;
    await candRef.collection("interviews").add({
      type: "phone",
      datetime: `${shift(ivDay)}T10:00`,
      interviewerUid: actor.id,
      interviewerName: actorName,
      status: past ? "completed" : "completed",
      score: 6 + (i % 4),
      notes: "Good call — moving them forward.",
      scorecard: null,
      createdAt: now(),
      createdBy: actor.id,
      demo: true,
    });
    ivCount += 1;

    if (i % 4 !== 3) {
      await candRef.collection("interviews").add({
        type: dept === "Field Marketing" ? "in_person" : "video",
        datetime: `${shift(ivDay + 6)}T14:00`,
        interviewerUid: actor.id,
        interviewerName: actorName,
        status: past ? "completed" : "scheduled",
        score: past ? 7 + (i % 3) : null,
        notes: past ? "Strong second round." : null,
        scorecard: null,
        createdAt: now(),
        createdBy: actor.id,
        demo: true,
      });
      ivCount += 1;
    }
  }
}

// Monthly overhead for every month that has a class in it, so the cost model
// has something to split.
for (const mk of monthsTouched) {
  await db.collection("v2Overhead").doc(mk).set({ payroll: 3800, tools: 400, demo: true }, { merge: true });
}

// One published scorecard form per role and interview type, so scoring works
// straight away in the demo.
const FORMS = {
  "Field Marketing__Field Marketer__phone": [
    ["Building rapport", [["graded", "How well did they build rapport?"], ["note", "First impression"]]],
    ["Discovery", [["graded", "Quality of their answers about past work"], ["graded", "Do they understand door-to-door work?"]]],
    ["Qualifying", [["yesno", "Has reliable transportation"], ["yesno", "Available for weekend shifts"], ["yesno", "Comfortable outdoors all day"]]],
  ],
  "Field Marketing__Field Marketer__in_person": [
    ["Mock pitch", [["graded", "Confidence and delivery"], ["graded", "Handled objections well"]]],
    ["Culture fit", [["graded", "Team fit and coachability"], ["note", "Overall read"]]],
    ["Final checks", [["yesno", "Can start with the class"], ["yesno", "Cleared background expectations"]]],
  ],
  "Sales__Solar Advisor__phone": [
    ["Background", [["graded", "Communication and confidence"]]],
    ["Sales experience", [["graded", "Depth of closing experience"], ["graded", "Objection handling"]]],
    ["Logistics", [["yesno", "Prior sales experience"], ["yesno", "Has or can get a HIS licence"], ["yesno", "Available evenings"]]],
  ],
  "Sales__Solar Advisor__video": [
    ["Deep dive", [["graded", "Closing walkthrough"], ["graded", "Consultative approach"]]],
    ["Commitment", [["yesno", "Comp expectations align"], ["note", "Manager's overall take"]]],
  ],
  "Contact Center__Agent__phone": [
    ["Phone presence", [["graded", "Clarity and tone"], ["graded", "Script read — how natural?"]]],
    ["Resilience", [["graded", "Handling back-to-back rejection"]]],
    ["Setup", [["yesno", "Reliable high-speed internet"], ["yesno", "Available for the full class"]]],
  ],
  "Contact Center__Agent__video": [
    ["Live simulation", [["graded", "Call simulation performance"], ["graded", "Rebuttal handling"]]],
    ["Wrap up", [["note", "Manager's overall take"], ["yesno", "Confirmed availability for class"]]],
  ],
};

const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
let formCount = 0;
let itemSeq = 0;
for (const [combo, sections] of Object.entries(FORMS)) {
  const [dept, role, ivType] = combo.split("__");
  await db
    .collection("scorecardForms")
    .doc(`${slug(dept)}__${slug(role)}__${slug(ivType)}`)
    .set({
      dept,
      role,
      ivType,
      status: "published",
      sections: sections.map(([label, items]) => ({
        id: `s${itemSeq++}`,
        label,
        items: items.map(([type, text]) => ({ id: `i${itemSeq++}`, type, text })),
      })),
      updatedBy: actor.id,
      updatedByName: actorName,
      updatedAt: now(),
      demo: true,
    });
  formCount += 1;
}

console.log(
  `seed done — ${classCount} classes, ${candCount} candidates, ${ivCount} interviews, ` +
    `${monthsTouched.size} months of overhead, ${formCount} scorecard forms. All tagged demo.`
);
console.log("Remove it all with: node scripts/seed-recruiting-demo.mjs purge");
process.exit(0);
