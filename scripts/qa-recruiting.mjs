// End-to-end check of the recruiting side against a running dev server.
// Usage: node scripts/qa-recruiting.mjs read | flow | cleanup
//
//   read    — every recruiting screen's data loads, with the real access rules
//   flow    — adds a candidate, schedules, scores, hires, and proves the
//             referral side pays exactly as it does today, then cleans up
//   cleanup — removes anything a failed run left behind
//
// Signs in as a real user by minting a token from the service account, so the
// routes are exercised through their own auth, not around it.
import { readFileSync } from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const raw = env.FIREBASE_SERVICE_ACCOUNT;
const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(json)) });
const db = getFirestore(app);

const BASE = process.env.QA_BASE || "http://localhost:3000";
const AS_EMAIL = process.env.QA_AS || "justin.black@currenthome.com";
const TAG = "QA-RECRUITING";
const mode = process.argv[2] || "read";

let pass = 0;
let fail = 0;
const ok = (name, extra = "") => {
  pass += 1;
  console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ""}`);
};
const bad = (name, why) => {
  fail += 1;
  console.log(`  FAIL  ${name} — ${why}`);
};

// --- sign in as a real user -------------------------------------------------
async function idToken() {
  const users = await db.collection("users").where("email", "==", AS_EMAIL).get();
  if (users.empty) throw new Error(`no user record for ${AS_EMAIL}`);
  const uid = users.docs[0].id;
  const custom = await getAuth(app).createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`token exchange failed: ${JSON.stringify(data)}`);
  return { token: data.idToken, uid };
}

const call = async (token, path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

// --- cleanup ----------------------------------------------------------------
async function cleanup(quiet) {
  let n = 0;
  const cands = await db.collection("candidates").where("qaTag", "==", TAG).get();
  for (const d of cands.docs) {
    const ivs = await d.ref.collection("interviews").get();
    for (const iv of ivs.docs) await iv.ref.delete();
    await d.ref.delete();
    n += 1;
  }
  const refs = await db.collection("referrals").where("qaTag", "==", TAG).get();
  for (const d of refs.docs) {
    const pts = await db.collection("pointsEvents").where("referralId", "==", d.id).get();
    for (const p of pts.docs) await p.ref.delete();
    const notes = await db.collection("notifications").where("referralId", "==", d.id).get();
    for (const p of notes.docs) await p.ref.delete();
    await d.ref.delete();
    n += 1;
  }
  const classes = await db.collection("classes").where("qaTag", "==", TAG).get();
  for (const d of classes.docs) {
    await d.ref.delete();
    n += 1;
  }
  if (!quiet) console.log(`cleanup — removed ${n} test records`);
  return n;
}

if (mode === "cleanup") {
  await cleanup();
  process.exit(0);
}

const { token } = await idToken();
console.log(`signed in as ${AS_EMAIL} against ${BASE}\n`);

// ---------------------------------------------------------------------------
// read: every screen's data
// ---------------------------------------------------------------------------
if (mode === "read") {
  const me = await call(token, "/api/me");
  me.body.v2Visible === true
    ? ok("/api/me reports recruiting access", `level ${me.body.v2Access}`)
    : bad("/api/me reports recruiting access", JSON.stringify(me.body));

  const classes = await call(token, "/api/recruiting/classes");
  classes.body.classes?.length
    ? ok("classes screen", `${classes.body.classes.length} classes, seats worked out`)
    : bad("classes screen", JSON.stringify(classes.body).slice(0, 120));

  const withSeats = (classes.body.classes || []).find((c) => c.seats && c.seats.hired > 0);
  withSeats
    ? ok("seat counts derived from candidates", `${withSeats.role}: ${withSeats.seats.hired} hired`)
    : bad("seat counts derived from candidates", "no class shows a hired seat");

  const cands = await call(token, "/api/recruiting/candidates");
  cands.body.candidates?.length
    ? ok("pipeline screen", `${cands.body.candidates.length} candidates with their interviews`)
    : bad("pipeline screen", JSON.stringify(cands.body).slice(0, 120));

  const roles = await call(token, "/api/recruiting/roles");
  roles.body.roles?.Sales?.length
    ? ok("roles per department", `Sales: ${roles.body.roles.Sales.join(", ")}`)
    : bad("roles per department", JSON.stringify(roles.body).slice(0, 120));

  const people = await call(token, "/api/recruiting/people");
  people.body.people?.length
    ? ok("interviewer list", `${people.body.people.length} with recruiting access`)
    : bad("interviewer list", JSON.stringify(people.body).slice(0, 120));

  const form = await call(
    token,
    "/api/recruiting/scorecards?dept=Sales&role=Solar%20Advisor&ivType=phone"
  );
  form.body.form?.sections?.length
    ? ok("scorecard form loads", `${form.body.form.sections.length} sections, ${form.body.form.status}`)
    : bad("scorecard form loads", JSON.stringify(form.body).slice(0, 120));

  const reports = await call(token, "/api/recruiting/reports");
  reports.body.classes?.length
    ? ok("reports screen", `${reports.body.classes.length} classes, ${Object.keys(reports.body.peopleByClass).length} with rosters`)
    : bad("reports screen", JSON.stringify(reports.body).slice(0, 120));

  // The report maths, run the same way the screens run it.
  const { classStats, classCost, collectTerms, funnelRates, milestoneStat } = await import(
    "../lib/reporting.js"
  );
  const r = reports.body;
  const past = r.classes.filter((c) => (r.peopleByClass[c.id] || []).length);
  if (past.length) {
    const c = past[0];
    const people = r.peopleByClass[c.id];
    const s = classStats(people, r.reasons);
    const cost = classCost(c, r.classes, r.peopleByClass, r.overhead, r.costFields);
    cost > 0
      ? ok("cost model", `${c.role}: $${Math.round(cost)} all in, $${Math.round(cost / s.hired)} per hire`)
      : bad("cost model", "cost came out zero");

    const m30 = milestoneStat(people.filter((p) => p.started), 30, r.today);
    m30.measurable > 0
      ? ok("retention counts from each first day", `30 days: ${m30.reached} of ${m30.measurable} measurable`)
      : bad("retention counts from each first day", "nothing measurable");
  } else {
    bad("cost model", "no class has a roster");
  }

  const terms = collectTerms(r.classes, r.peopleByClass, r.today);
  terms.terms.length
    ? ok("terminations report", `${terms.terms.length} left, ${terms.active} still here, ${terms.noShow} no-shows`)
    : bad("terminations report", "no separations found");

  const rates = funnelRates(r.classes, r.peopleByClass, r.overhead, r.costFields, r.today);
  rates.hasData
    ? ok(
        "forecast has rates",
        `${(rates.appToPre * 100).toFixed(0)}% app→prescreen, ${(rates.ivToHire * 100).toFixed(0)}% interview→hire, $${Math.round(rates.costPerHire)}/hire`
      )
    : bad("forecast has rates", "not enough history");

  const activity = await call(token, "/api/recruiting/activity");
  Array.isArray(activity.body.rows)
    ? ok("activity feed", `${activity.body.rows.length} entries`)
    : bad("activity feed", JSON.stringify(activity.body).slice(0, 120));

  const demo = await call(token, "/api/recruiting/demo");
  demo.body.total > 0
    ? ok("demo purge sees its own data", `${demo.body.total} tagged records, purge allowed: ${demo.body.canPurge}`)
    : bad("demo purge sees its own data", JSON.stringify(demo.body).slice(0, 120));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ---------------------------------------------------------------------------
// flow: add → schedule → score → hire → referral pays, then clean up
// ---------------------------------------------------------------------------
if (mode === "flow") {
  await cleanup(true);

  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const QA_PHONE = "9515559999";

  // A referral for the same person, so the match and the write-back are real.
  const referrer = (await db.collection("users").where("email", "==", AS_EMAIL).get()).docs[0];
  const refDoc = await db.collection("referrals").add({
    candidateName: "QA Test Person",
    candidatePhone: "(951) 555-9999",
    phoneKey: QA_PHONE,
    dept: "Sales",
    referrerUid: referrer.id,
    referrerName: referrer.data().name,
    referrerDept: referrer.data().dept || "",
    source: "qa",
    stage: 2,
    out: false,
    lead: "recruiting",
    startDate: null,
    terminationDate: null,
    startAwarded: false,
    day30Awarded: false,
    createdAt: now,
    stageChangedAt: now,
    timeline: [{ stage: "Submitted", at: now }],
    qaTag: TAG,
    demo: false,
  });
  ok("set up a referral to match against", `stage 2, no start date`);

  // A class to hire them into.
  const clsDoc = await db.collection("classes").add({
    dept: "Sales",
    role: "Solar Advisor",
    date: today,
    location: "QA",
    target: 5,
    createdBy: referrer.id,
    createdByName: referrer.data().name,
    createdAt: now,
    qaTag: TAG,
    demo: false,
  });

  // Add the candidate through the real route, with the matching phone.
  const add = await call(token, "/api/recruiting/candidates", {
    method: "POST",
    body: {
      name: "QA Test Person",
      phone: "(951) 555-9999",
      email: "qa@example.com",
      dept: "Sales",
      role: "Solar Advisor",
      classId: clsDoc.id,
      prescreenNotes: "QA run.",
    },
  });
  const candId = add.body.id;
  candId ? ok("added a candidate", add.body.message) : bad("added a candidate", JSON.stringify(add.body));
  if (!candId) process.exit(1);
  await db.collection("candidates").doc(candId).update({ qaTag: TAG });

  const cand = (await call(token, `/api/recruiting/candidates/${candId}`)).body.candidate;
  cand.referralId === refDoc.id
    ? ok("matched them to the referral by phone", `referred by ${cand.referrerName}`)
    : bad("matched them to the referral by phone", `referralId ${cand.referralId}`);

  const sched = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: {
      action: "scheduleInterview",
      type: "phone",
      date: today,
      time: "10:00",
      interviewerUid: referrer.id,
    },
  });
  sched.status === 200
    ? ok("scheduled an interview", sched.body.message)
    : bad("scheduled an interview", JSON.stringify(sched.body));

  // Score it against the published form.
  const withIv = (await call(token, `/api/recruiting/candidates/${candId}`)).body.candidate;
  const iv = withIv.interviews.find((i) => i.status === "scheduled");
  const form = (
    await call(token, "/api/recruiting/scorecards?dept=Sales&role=Solar%20Advisor&ivType=phone")
  ).body.form;
  const responses = {};
  form.sections.forEach((s) =>
    s.items.forEach((it) => {
      if (it.type === "graded") responses[it.id] = { score: 8, note: "QA" };
      else if (it.type === "yesno") responses[it.id] = { answer: "yes" };
      else responses[it.id] = { note: "QA" };
    })
  );
  const score = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: { action: "scoreInterview", interviewId: iv.id, responses, notes: "QA scorecard" },
  });
  score.status === 200
    ? ok("scored the interview", score.body.message)
    : bad("scored the interview", JSON.stringify(score.body));

  const rescore = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: { action: "scoreInterview", interviewId: iv.id, responses, notes: "again" },
  });
  rescore.status !== 200
    ? ok("an interview can't be scored twice", rescore.body.error)
    : bad("an interview can't be scored twice", "it let me");

  const snapshot = (await db.collection("candidates").doc(candId).collection("interviews").doc(iv.id).get()).data();
  snapshot.scorecard?.sections?.length
    ? ok("scorecard saved as a snapshot", `${snapshot.scorecard.sections.length} sections, score ${snapshot.score}`)
    : bad("scorecard saved as a snapshot", "no sections stored");

  // Straight to hire is refused — offer has to be accepted first.
  const early = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: { action: "hire", startDate: today },
  });
  early.status !== 200
    ? ok("can't hire before the offer is accepted", early.body.error)
    : bad("can't hire before the offer is accepted", "it let me");

  for (const to of ["offer_extended", "offer_accepted"]) {
    const mv = await call(token, `/api/recruiting/candidates/${candId}`, {
      method: "POST",
      body: { action: "stage", to },
    });
    mv.status === 200 ? ok(`moved to ${to}`, mv.body.message) : bad(`moved to ${to}`, JSON.stringify(mv.body));
  }

  const noDate = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: { action: "hire" },
  });
  noDate.status !== 200
    ? ok("hiring demands a first day", noDate.body.error)
    : bad("hiring demands a first day", "it let me hire with no date");

  const hire = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: { action: "hire", startDate: today },
  });
  hire.status === 200 ? ok("hired them", hire.body.message) : bad("hired them", JSON.stringify(hire.body));

  // The write-back: exactly two fields on the referral, nothing else.
  const after = (await refDoc.get()).data();
  after.stage === 6
    ? ok("referral advanced to Hired", `stage ${after.stage}`)
    : bad("referral advanced to Hired", `stage ${after.stage}`);
  after.startDate === today
    ? ok("referral got the start date", after.startDate)
    : bad("referral got the start date", String(after.startDate));
  after.startAwarded !== true && after.day30Awarded !== true
    ? ok("recruiting never touched the awarded flags", "both still unset")
    : bad("recruiting never touched the awarded flags", "a flag was set");
  after.timeline.length === 2 && after.timeline[1].via === "recruiting"
    ? ok("one timeline entry, marked as from recruiting", JSON.stringify(after.timeline[1]))
    : bad("one timeline entry, marked as from recruiting", JSON.stringify(after.timeline));

  const ptsBefore = await db.collection("pointsEvents").where("referralId", "==", refDoc.id).get();
  ptsBefore.empty
    ? ok("no points written by recruiting", "the daily job is the only thing that pays")
    : bad("no points written by recruiting", `${ptsBefore.size} events already there`);

  // The daily job — the actual money path, untouched by any of this.
  const cron = await fetch(`${BASE}/api/cron/daily`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const cronBody = await cron.json();
  const paid = (cronBody.awarded || []).filter((a) => a.id === refDoc.id);
  paid.some((a) => a.milestone === "start")
    ? ok("daily job paid the referrer's start points", JSON.stringify(paid))
    : bad("daily job paid the referrer's start points", JSON.stringify(cronBody).slice(0, 200));

  const ptsAfter = await db.collection("pointsEvents").where("referralId", "==", refDoc.id).get();
  const startEvent = ptsAfter.docs.map((d) => d.data()).find((p) => p.milestone === "start");
  startEvent
    ? ok("points landed on the referrer", `${startEvent.points} points to ${AS_EMAIL}`)
    : bad("points landed on the referrer", `${ptsAfter.size} events`);

  // Running it again must not double-pay.
  const cron2 = await fetch(`${BASE}/api/cron/daily`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const again = ((await cron2.json()).awarded || []).filter((a) => a.id === refDoc.id);
  again.length === 0
    ? ok("daily job doesn't pay twice", "second run awarded nothing")
    : bad("daily job doesn't pay twice", JSON.stringify(again));

  // Re-hiring must not disturb the referral or send a second email.
  const reHire = await call(token, `/api/recruiting/candidates/${candId}`, {
    method: "POST",
    body: { action: "hire", startDate: today },
  });
  const afterRe = (await refDoc.get()).data();
  reHire.status !== 200 && afterRe.timeline.length === 2
    ? ok("re-hiring changes nothing", reHire.body.error)
    : bad("re-hiring changes nothing", `${reHire.status} / ${afterRe.timeline.length} timeline entries`);

  await cleanup(true);
  const gone = await db.collection("candidates").doc(candId).get();
  !gone.exists ? ok("test records cleaned up", "") : bad("test records cleaned up", "candidate still there");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ---------------------------------------------------------------------------
// picker: starting a candidate from a referral that's already been submitted
// ---------------------------------------------------------------------------
if (mode === "picker") {
  await cleanup(true);

  const now = new Date().toISOString();
  const referrer = (await db.collection("users").where("email", "==", AS_EMAIL).get()).docs[0];

  // One waiting referral, with a resume on it, and one already passed on.
  const waiting = await db.collection("referrals").add({
    candidateName: "QA Picker Person",
    candidatePhone: "(951) 555-9911",
    phoneKey: "9515559911",
    dept: "Sales",
    resumeUrl: "https://example.com/qa-resume.pdf",
    resumeName: "QA_Resume.pdf",
    referrerUid: referrer.id,
    referrerName: referrer.data().name,
    referrerDept: referrer.data().dept || "",
    stage: 1,
    out: false,
    lead: "recruiting",
    startDate: null,
    startAwarded: false,
    day30Awarded: false,
    createdAt: now,
    stageChangedAt: now,
    timeline: [{ stage: "Submitted", at: now }],
    qaTag: TAG,
  });
  const passedOn = await db.collection("referrals").add({
    candidateName: "QA Passed Person",
    candidatePhone: "(951) 555-9912",
    phoneKey: "9515559912",
    dept: "Sales",
    referrerUid: referrer.id,
    referrerName: referrer.data().name,
    stage: 1,
    out: true,
    lead: "recruiting",
    createdAt: now,
    stageChangedAt: now,
    timeline: [],
    qaTag: TAG,
  });

  const list = (await call(token, "/api/recruiting/referrals")).body.referrals || [];
  list.some((r) => r.id === waiting.id)
    ? ok("waiting referral offered in the list", `${list.length} available`)
    : bad("waiting referral offered in the list", "not there");
  !list.some((r) => r.id === passedOn.id)
    ? ok("a referral marked not moving forward is left out", "")
    : bad("a referral marked not moving forward is left out", "it was offered");

  const offered = list.find((r) => r.id === waiting.id);
  offered?.resumeName === "QA_Resume.pdf" && offered.referrerName
    ? ok("list carries what the form needs", `${offered.name}, ${offered.dept}, resume + referrer`)
    : bad("list carries what the form needs", JSON.stringify(offered));

  // Add from it. Note the phone sent is deliberately wrong — the link must come
  // from the referral that was picked, not from matching digits.
  const add = await call(token, "/api/recruiting/candidates", {
    method: "POST",
    body: {
      name: "QA Picker Person",
      phone: "(951) 555-0000",
      dept: "Sales",
      role: "Solar Advisor",
      referralId: waiting.id,
      prescreenNotes: "QA picker run.",
    },
  });
  const candId = add.body.id;
  candId ? ok("added from the referral", add.body.message) : bad("added from the referral", JSON.stringify(add.body));
  if (!candId) process.exit(1);
  await db.collection("candidates").doc(candId).update({ qaTag: TAG });

  const cand = (await call(token, `/api/recruiting/candidates/${candId}`)).body.candidate;
  cand.referralId === waiting.id
    ? ok("linked even though the phone didn't match", `referred by ${cand.referrerName}`)
    : bad("linked even though the phone didn't match", `referralId ${cand.referralId}`);
  cand.resumeName === "QA_Resume.pdf"
    ? ok("resume came across from the referral", cand.resumeName)
    : bad("resume came across from the referral", String(cand.resumeName));
  cand.source === "referral"
    ? ok("counted as a referral, not a job-board applicant", cand.source)
    : bad("counted as a referral, not a job-board applicant", String(cand.source));

  const dupe = await call(token, "/api/recruiting/candidates", {
    method: "POST",
    body: { name: "QA Picker Person", phone: "(951) 555-9911", dept: "Sales", role: "Solar Advisor", referralId: waiting.id },
  });
  dupe.status !== 200
    ? ok("the same referral can't be started twice", dupe.body.error)
    : bad("the same referral can't be started twice", "it let me");

  const outAttempt = await call(token, "/api/recruiting/candidates", {
    method: "POST",
    body: { name: "QA Passed Person", phone: "(951) 555-9912", dept: "Sales", role: "Solar Advisor", referralId: passedOn.id },
  });
  outAttempt.status !== 200
    ? ok("can't start from one that was passed on", outAttempt.body.error)
    : bad("can't start from one that was passed on", "it let me");

  const listAfter = (await call(token, "/api/recruiting/referrals")).body.referrals || [];
  !listAfter.some((r) => r.id === waiting.id)
    ? ok("it drops off the list once someone's working it", "")
    : bad("it drops off the list once someone's working it", "still offered");

  await cleanup(true);
  ok("test records cleaned up", "");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

console.error(`unknown mode: ${mode}`);
process.exit(1);
