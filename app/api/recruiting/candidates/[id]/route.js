import { NextResponse } from "next/server";
import { requireV2, jsonError, audit } from "@/lib/server";
import { HIRED_STAGE, STAGES } from "@/lib/constants";
import { notifyHiredDistros } from "@/lib/notify";
import { getScoring } from "@/lib/points";
import {
  ALL_CANDIDATE_STAGES,
  STAGE_LABEL,
  INTERVIEW_TYPES,
  INTERVIEW_LABEL,
  INTERVIEW_CLOSED,
  INTERVIEW_CLOSED_LABEL,
  isDateOnly,
  referrerDepts,
  formKey,
  buildScorecard,
} from "@/lib/recruiting";
import { getV2Config } from "../../config/route";

// Moves on one candidate: stage changes, hiring them (which is where a first
// day gets set), and scheduling an interview.

// Which moves are allowed from where. Hiring is deliberately only reachable
// from an accepted offer, so nobody is marked hired before they've said yes.
const ALLOWED_MOVES = {
  interviewing: ["offer_extended", "on_hold", "rejected"],
  offer_extended: ["offer_accepted", "on_hold", "rejected", "offer_rejected"],
  offer_accepted: ["hired", "rejected", "offer_rejected"],
  on_hold: ["interviewing", "rejected"],
  rejected: ["interviewing"],
  // Turning us down isn't final either — people come back.
  offer_rejected: ["interviewing"],
  hired: [],
};

// The one place the recruiting side writes into the referral side, and it
// writes exactly two things: advance the referral to Hired, and set the start
// date. The referral app's daily job does the rest — it pays the referrer on
// that start date and again at day 30, exactly as it does for a hire a manager
// records by hand. Nothing here touches points, awarded flags, or email.
async function writeBackToReferral(db, user, candidate, startDate) {
  if (!candidate.referralId) return { done: false };

  const ref = db.collection("referrals").doc(candidate.referralId);
  const snap = await ref.get();
  if (!snap.exists) {
    await audit(db, user, "v2.referralWriteback.skipped", candidate.id, {
      name: candidate.name,
      dept: candidate.dept,
      reason: "the linked referral no longer exists",
      referralId: candidate.referralId,
    });
    return { done: false, message: "Their referral no longer exists, so nothing was passed across." };
  }
  const r = snap.data();

  // A referral someone marked "not moving forward" is a human's decision, and
  // the daily job ignores it anyway — so it would look advanced and never pay.
  // Leave it alone and say so rather than quietly overruling a manager.
  if (r.out) {
    await audit(db, user, "v2.referralWriteback.skipped", candidate.id, {
      name: candidate.name,
      dept: candidate.dept,
      reason: "their referral is marked not moving forward",
      referralId: candidate.referralId,
      referrerName: r.referrerName || null,
    });
    return {
      done: false,
      message: `Their referral is marked "not moving forward", so it was left alone — a manager needs to reopen it for ${r.referrerName || "the referrer"} to be paid.`,
    };
  }

  const now = new Date().toISOString();
  const update = {};
  const timeline = [...(r.timeline || [])];

  // Safe to run twice: already at Hired means no second timeline entry, and an
  // existing start date is never overwritten.
  if (r.stage !== HIRED_STAGE) {
    update.stage = HIRED_STAGE;
    update.stageChangedAt = now;
    // One entry rather than inventing the stages in between, and it says where
    // it came from so the referral's history stays honest.
    timeline.push({ stage: STAGES[HIRED_STAGE], at: now, via: "recruiting" });
    update.timeline = timeline;
  }
  if (!r.startDate) update.startDate = startDate;

  if (!Object.keys(update).length) {
    return { done: false, message: "Their referral was already up to date." };
  }

  await ref.update(update);

  // Payroll, recruiting and Skip get the same hire email they get when a
  // manager advances a referral by hand — this is the only way they hear that
  // money is owed (decision 3A.8). Only on the run that actually advances it,
  // so re-marking someone hired can't send it twice. sendMail swallows its own
  // failures, so a mail problem can never undo the hire.
  let emailed = false;
  if (update.stage !== undefined) {
    await notifyHiredDistros({
      referral: { ...r, ...update },
      scoring: await getScoring(db),
      startDate: update.startDate || r.startDate || startDate,
    });
    emailed = true;
  }

  await audit(db, user, "v2.referralWriteback", candidate.id, {
    name: candidate.name,
    dept: candidate.dept,
    referralId: candidate.referralId,
    referrerName: r.referrerName || null,
    advancedToHired: update.stage !== undefined,
    startDateSet: update.startDate || null,
    startDateAlready: r.startDate || null,
    distrosEmailed: emailed,
  });

  return {
    done: true,
    message: `${r.referrerName || "Their referrer"}'s referral was advanced to Hired${
      update.startDate ? ` with a start date of ${update.startDate}` : ""
    } — the daily job pays them from there${emailed ? ", and payroll has been emailed" : ""}.`,
  };
}

async function loadCandidate(db, id, v2) {
  const ref = db.collection("candidates").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: jsonError("Candidate not found", 404) };
  const candidate = { id, ...snap.data() };
  if (!v2.allDepts && candidate.dept !== v2.scopeDept) {
    return { error: jsonError("That candidate is outside your department.", 403) };
  }
  return { ref, candidate };
}

export async function GET(request, { params }) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const { id } = await params;
  const loaded = await loadCandidate(db, id, v2);
  if (loaded.error) return loaded.error;

  const ivSnap = await loaded.ref.collection("interviews").get();
  const interviews = ivSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const depts = await referrerDepts(db, [loaded.candidate.referrerUid]);
  return NextResponse.json({
    candidate: {
      ...loaded.candidate,
      referrerDept: depts[loaded.candidate.referrerUid] || "",
      interviews,
    },
  });
}

// Someone entered by mistake can be removed outright. A hired candidate can't:
// their class report counts them, and if they were referred, their hire is what
// started the referrer's points — deleting them would quietly break both.
export async function DELETE(request, { params }) {
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  const { id } = await params;
  const loaded = await loadCandidate(db, id, v2);
  if (loaded.error) return loaded.error;
  const { ref, candidate } = loaded;

  if (candidate.stage === "hired") {
    return jsonError(
      `${candidate.name} has been hired, so they can't be deleted — their class report counts them, and a referral may be paying out on them.`,
      403
    );
  }

  // Their interviews live underneath them and go too.
  const ivs = await ref.collection("interviews").get();
  for (const iv of ivs.docs) await iv.ref.delete();
  await ref.delete();

  await audit(db, user, "v2.candidate.delete", id, {
    name: candidate.name,
    dept: candidate.dept,
    role: candidate.role,
    stage: candidate.stage,
    interviewsRemoved: ivs.size,
    referralId: candidate.referralId || null,
  });

  return NextResponse.json({ ok: true, message: `${candidate.name} deleted.` });
}

export async function POST(request, { params }) {
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  const { id } = await params;
  const loaded = await loadCandidate(db, id, v2);
  if (loaded.error) return loaded.error;
  const { ref, candidate } = loaded;

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "stage") {
    const to = String(body.to || "");
    if (!ALL_CANDIDATE_STAGES.includes(to)) return jsonError("Unknown stage.");
    if (to === "hired") return jsonError("Use the hire action so a first day gets set.");
    if (!(ALLOWED_MOVES[candidate.stage] || []).includes(to)) {
      return jsonError(`Can't go from ${STAGE_LABEL[candidate.stage]} to ${STAGE_LABEL[to]}.`);
    }

    await ref.update({ stage: to, stageChangedAt: new Date().toISOString() });
    await audit(db, user, "v2.candidate.stage", id, {
      name: candidate.name,
      dept: candidate.dept,
      from: STAGE_LABEL[candidate.stage],
      to: STAGE_LABEL[to],
    });
    return NextResponse.json({ ok: true, message: `${candidate.name} → ${STAGE_LABEL[to]}` });
  }

  if (action === "hire") {
    if (candidate.stage === "hired") return jsonError("Already hired.");
    if (candidate.stage !== "offer_accepted") return jsonError("Mark the offer accepted first.");
    // Decision 3A.2: every hire gets their own first day. Retention counts
    // from this date, and it's the date the referral side is handed below.
    if (!isDateOnly(body.startDate)) return jsonError("Pick their first day.");

    const now = new Date().toISOString();
    await ref.update({ stage: "hired", startDate: body.startDate, stageChangedAt: now, hiredAt: now });
    await audit(db, user, "v2.candidate.hire", id, {
      name: candidate.name,
      dept: candidate.dept,
      role: candidate.role,
      classId: candidate.classId || null,
      startDate: body.startDate,
    });

    const writeback = await writeBackToReferral(db, user, candidate, body.startDate);

    return NextResponse.json({
      ok: true,
      message: `${candidate.name} hired — first day ${body.startDate}.${
        writeback.message ? ` ${writeback.message}` : ""
      }`,
    });
  }

  if (action === "scheduleInterview") {
    if (["rejected", "offer_rejected"].includes(candidate.stage)) {
      return jsonError("Reopen this candidate first.");
    }
    if (!INTERVIEW_TYPES.includes(body.type)) return jsonError("Pick an interview type.");
    if (!isDateOnly(body.date)) return jsonError("Pick a date.");
    if (!/^\d{2}:\d{2}$/.test(String(body.time || ""))) return jsonError("Pick a time.");

    const whoUid = String(body.interviewerUid || "").trim();
    if (!whoUid) return jsonError("Pick who's interviewing.");
    const whoSnap = await db.collection("users").doc(whoUid).get();
    if (!whoSnap.exists) return jsonError("That interviewer no longer exists.");

    const now = new Date().toISOString();
    const ivRef = await ref.collection("interviews").add({
      type: body.type,
      datetime: `${body.date}T${body.time}`,
      interviewerUid: whoUid,
      interviewerName: whoSnap.data().name || "",
      status: "scheduled",
      score: null,
      scorecard: null,
      createdAt: now,
      createdBy: user.uid,
    });

    // Someone put on hold who gets a new interview is being worked again.
    if (candidate.stage === "on_hold") await ref.update({ stage: "interviewing", stageChangedAt: now });

    await audit(db, user, "v2.interview.schedule", id, {
      name: candidate.name,
      dept: candidate.dept,
      type: INTERVIEW_LABEL[body.type],
      when: `${body.date} ${body.time}`,
      interviewer: whoSnap.data().name || "",
      interviewId: ivRef.id,
    });
    return NextResponse.json({
      ok: true,
      message: `${INTERVIEW_LABEL[body.type]} interview scheduled with ${whoSnap.data().name}.`,
    });
  }

  // Times move. The interview keeps its identity and simply takes the new
  // details — one interview that moved, not two that were booked.
  if (action === "rescheduleInterview") {
    const ivId = String(body.interviewId || "").trim();
    if (!ivId) return jsonError("Which interview?");
    const ivRef = ref.collection("interviews").doc(ivId);
    const ivSnap = await ivRef.get();
    if (!ivSnap.exists) return jsonError("Interview not found", 404);
    const iv = ivSnap.data();
    if (iv.status !== "scheduled") return jsonError("That interview is already closed out.");

    if (!INTERVIEW_TYPES.includes(body.type)) return jsonError("Pick an interview type.");
    if (!isDateOnly(body.date)) return jsonError("Pick a date.");
    if (!/^\d{2}:\d{2}$/.test(String(body.time || ""))) return jsonError("Pick a time.");

    const whoUid = String(body.interviewerUid || "").trim();
    if (!whoUid) return jsonError("Pick who's interviewing.");
    const whoSnap = await db.collection("users").doc(whoUid).get();
    if (!whoSnap.exists) return jsonError("That interviewer no longer exists.");

    await ivRef.update({
      type: body.type,
      datetime: `${body.date}T${body.time}`,
      interviewerUid: whoUid,
      interviewerName: whoSnap.data().name || "",
    });

    // The old time is gone from the record, so the audit trail is where it
    // stays — that's what answers "this has moved three times".
    await audit(db, user, "v2.interview.reschedule", id, {
      name: candidate.name,
      dept: candidate.dept,
      was: `${INTERVIEW_LABEL[iv.type]} ${iv.datetime.replace("T", " ")} with ${iv.interviewerName}`,
      now: `${INTERVIEW_LABEL[body.type]} ${body.date} ${body.time} with ${whoSnap.data().name || ""}`,
      interviewId: ivId,
    });

    return NextResponse.json({
      ok: true,
      message: `Moved to ${body.date} ${body.time} with ${whoSnap.data().name}.`,
    });
  }

  // A scheduled interview that never happened. It closes with what went wrong
  // instead of a score, so it stops showing as still to come.
  if (action === "closeInterview") {
    const ivId = String(body.interviewId || "").trim();
    if (!ivId) return jsonError("Which interview?");
    const outcome = String(body.outcome || "");
    if (!INTERVIEW_CLOSED.includes(outcome)) return jsonError("Pick what happened.");

    const ivRef = ref.collection("interviews").doc(ivId);
    const ivSnap = await ivRef.get();
    if (!ivSnap.exists) return jsonError("Interview not found", 404);
    const iv = ivSnap.data();
    if (iv.status !== "scheduled") return jsonError("That interview is already closed out.");

    await ivRef.update({
      status: outcome,
      closedAt: new Date().toISOString(),
      closedByUid: user.uid,
      closedByName: user.name,
    });

    await audit(db, user, "v2.interview.close", id, {
      name: candidate.name,
      dept: candidate.dept,
      type: INTERVIEW_LABEL[iv.type],
      when: iv.datetime.replace("T", " "),
      outcome: INTERVIEW_CLOSED_LABEL[outcome],
      interviewId: ivId,
    });

    return NextResponse.json({
      ok: true,
      message: `${candidate.name} — ${INTERVIEW_CLOSED_LABEL[outcome]}.`,
    });
  }

  if (action === "scoreInterview") {
    const ivId = String(body.interviewId || "").trim();
    if (!ivId) return jsonError("Which interview?");
    const ivRef = ref.collection("interviews").doc(ivId);
    const ivSnap = await ivRef.get();
    if (!ivSnap.exists) return jsonError("Interview not found", 404);
    const iv = ivSnap.data();
    // Scored once. A finished scorecard is the record of what happened in that
    // room, so it isn't overwritten later.
    if (iv.status !== "scheduled") return jsonError("That interview is already closed out.");

    const formSnap = await db
      .collection("scorecardForms")
      .doc(formKey(candidate.dept, candidate.role, iv.type))
      .get();
    const form = formSnap.exists ? formSnap.data() : null;
    if (!form || !(form.sections || []).some((s) => (s.items || []).length)) {
      return jsonError(`No ${INTERVIEW_LABEL[iv.type]} form built yet for ${candidate.role}. Build it on Scorecards first.`);
    }

    // The snapshot is built from the stored form, never from anything the
    // browser sent, so the questions on record are the real ones.
    const built = buildScorecard(form, body.responses);
    const now = new Date().toISOString();

    await ivRef.update({
      status: "completed",
      score: built.avg,
      notes: String(body.notes || "").trim().slice(0, 4000) || "(no written feedback)",
      scorecard: {
        ivType: iv.type,
        formStatus: form.status || "draft",
        ...built,
        scoredByUid: user.uid,
        scoredByName: user.name,
        scoredAt: now,
      },
    });

    await audit(db, user, "v2.interview.score", id, {
      name: candidate.name,
      dept: candidate.dept,
      type: INTERVIEW_LABEL[iv.type],
      score: built.avg,
      quals: built.qualsTotal ? `${built.qualsMet}/${built.qualsTotal}` : null,
      interviewId: ivId,
    });

    return NextResponse.json({
      ok: true,
      message: built.avg != null
        ? `Scored ${candidate.name} — ${built.avg}/10${built.qualsTotal ? `, ${built.qualsMet}/${built.qualsTotal} quals met` : ""}.`
        : "Scorecard saved.",
    });
  }

  if (action === "outcome") {
    // What happened after they were hired: did they show up, did they get
    // through training, and if they've gone, when and why. These are the only
    // things a class report needs a person to type in — and they're entered
    // from the Reports screen, which is executives-only for editing.
    if (v2.level !== "exec") {
      return jsonError("Recording what happened to a hire is an executive's to do.", 403);
    }
    if (candidate.stage !== "hired") return jsonError("Only a hired person has an outcome yet.");

    const update = {};
    if (typeof body.started === "boolean") {
      update.started = body.started;
      if (!body.started) update.graduated = false; // can't graduate a no-show
    }
    if (typeof body.graduated === "boolean") update.graduated = body.graduated;

    if (body.terminationDate !== undefined) {
      const term = String(body.terminationDate || "");
      if (term && !isDateOnly(term)) return jsonError("Pick a valid separation date.");
      if (term && candidate.startDate && term < candidate.startDate) {
        return jsonError("Someone can't leave before their first day.");
      }
      update.terminationDate = term || null;
      if (!term) update.termReasonId = null;
    }

    if (body.termReasonId !== undefined) {
      const reasonId = String(body.termReasonId || "");
      if (reasonId) {
        const { reasons } = await getV2Config(db);
        if (!reasons.some((r) => r.id === reasonId)) return jsonError("Pick a reason from the list.");
      }
      update.termReasonId = reasonId || null;
    }

    if (!Object.keys(update).length) return jsonError("Nothing to save.");

    await ref.update(update);
    await audit(db, user, "v2.candidate.outcome", id, {
      name: candidate.name,
      dept: candidate.dept,
      ...update,
    });
    return NextResponse.json({ ok: true, message: `${candidate.name} updated.` });
  }

  if (action === "setClass") {
    const classId = String(body.classId || "").trim() || null;
    if (classId) {
      const clsSnap = await db.collection("classes").doc(classId).get();
      if (!clsSnap.exists) return jsonError("That class no longer exists.");
      const cls = clsSnap.data();
      if (cls.dept !== candidate.dept || cls.role !== candidate.role) {
        return jsonError("That class is for a different role.");
      }
    }
    await ref.update({ classId });
    await audit(db, user, "v2.candidate.setClass", id, { name: candidate.name, classId });
    return NextResponse.json({ ok: true, message: classId ? "Class updated." : "Class cleared." });
  }

  return jsonError("Unknown action");
}
