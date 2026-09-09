import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireV2, jsonError, audit } from "@/lib/server";
import { DEPARTMENTS, phoneKey, formatPhone } from "@/lib/constants";
import {
  getRoles,
  rolesFor,
  INTERVIEW_TYPES,
  INTERVIEW_LABEL,
  isDateOnly,
  matchReferral,
  referrerDepts,
} from "@/lib/recruiting";

const RESUME_TYPES = [".pdf", ".doc", ".docx"];
const RESUME_MAX_BYTES = 4 * 1024 * 1024;

// Candidates in the interview pipeline. Added only after a recruiter's phone
// pre-screen, which is how the team actually works — so the pre-screen notes
// and the first interview are part of adding someone, not a later step.

export async function GET(request) {
  const { db, error, v2 } = await requireV2(request);
  if (error) return error;

  const snap = await db.collection("candidates").get();
  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => v2.allDepts || c.dept === v2.scopeDept)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Interviews live in a subcollection per candidate; the list screens only
  // need the next scheduled one and the latest score, so fetch them together
  // rather than making the client ask per card.
  const depts = await referrerDepts(db, candidates.map((c) => c.referrerUid));
  const withIvs = await Promise.all(
    candidates.map(async (c) => {
      const ivSnap = await db.collection("candidates").doc(c.id).collection("interviews").get();
      const interviews = ivSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.datetime.localeCompare(b.datetime));
      return { ...c, referrerDept: depts[c.referrerUid] || "", interviews };
    })
  );

  return NextResponse.json({ candidates: withIvs, scopeDept: v2.scopeDept, level: v2.level });
}

export async function POST(request) {
  const { user, db, error, v2 } = await requireV2(request);
  if (error) return error;

  // Multipart when a resume comes along, plain JSON when it doesn't — same
  // shape the public apply route uses.
  let body = {};
  let resumeFile = null;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return jsonError("Bad request");
    body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    const f = form.get("resume");
    if (f && typeof f !== "string" && f.size > 0) resumeFile = f;
  } else {
    body = await request.json().catch(() => ({}));
  }

  const name = String(body.name || "").trim().slice(0, 100);
  if (name.length < 2) return jsonError("Enter the candidate's name.");

  const key = phoneKey(body.phone);
  if (key.length !== 10) return jsonError("Enter a valid 10-digit mobile number.");

  const dept = v2.allDepts ? String(body.dept || "").trim() : v2.scopeDept;
  if (!DEPARTMENTS.includes(dept)) return jsonError("Pick a department.");

  const roles = await getRoles(db);
  const role = String(body.role || "").trim();
  if (!rolesFor(roles, dept).includes(role)) return jsonError("Pick a role for that department.");

  // Target class is optional — plenty of hires never come through a cohort.
  let classId = String(body.classId || "").trim() || null;
  if (classId) {
    const clsSnap = await db.collection("classes").doc(classId).get();
    if (!clsSnap.exists) return jsonError("That class no longer exists.");
    const cls = clsSnap.data();
    if (cls.dept !== dept || cls.role !== role) return jsonError("That class is for a different role.");
  }

  // Scheduling the first interview is part of adding someone, but optional.
  let firstIv = null;
  if (body.ivType) {
    if (!INTERVIEW_TYPES.includes(body.ivType)) return jsonError("Pick an interview type.");
    if (!isDateOnly(body.ivDate)) return jsonError("Pick a date for the first interview.");
    if (!/^\d{2}:\d{2}$/.test(String(body.ivTime || ""))) return jsonError("Pick a time for the first interview.");
    const whoUid = String(body.ivInterviewer || "").trim();
    if (!whoUid) return jsonError("Pick who's interviewing.");
    const whoSnap = await db.collection("users").doc(whoUid).get();
    if (!whoSnap.exists) return jsonError("That interviewer no longer exists.");
    firstIv = {
      type: body.ivType,
      datetime: `${body.ivDate}T${body.ivTime}`,
      interviewerUid: whoUid,
      interviewerName: whoSnap.data().name || "",
    };
  }

  let resumeUrl = "";
  let resumeName = "";
  if (resumeFile) {
    const lower = (resumeFile.name || "resume").toLowerCase();
    if (!RESUME_TYPES.some((ext) => lower.endsWith(ext))) {
      return jsonError("Resume must be a PDF or Word document.");
    }
    if (resumeFile.size > RESUME_MAX_BYTES) return jsonError("Resume must be under 4 MB.");
    try {
      const blob = await put(`resumes/${lower.replace(/[^a-z0-9._-]/g, "_")}`, resumeFile, {
        access: "public",
        addRandomSuffix: true,
      });
      resumeUrl = blob.url;
      resumeName = resumeFile.name;
    } catch (err) {
      console.error("Resume upload failed:", err.message);
      // The candidate still gets added — the resume is optional.
    }
  }

  const prescreenNotes = String(body.prescreenNotes || "").trim().slice(0, 4000);
  const now = new Date().toISOString();

  // Was this person already referred by an employee? Read-only for now: the
  // link is recorded and shown, and nothing is written back to the referral.
  const match = await matchReferral(db, key);

  const ref = await db.collection("candidates").add({
    name,
    phone: formatPhone(key),
    phoneKey: key,
    email: String(body.email || "").trim().slice(0, 120),
    dept,
    role,
    classId,
    stage: "interviewing",
    source: match.referral ? "referral" : "job-board",
    referralId: match.referral?.id || null,
    referrerUid: match.referral?.referrerUid || null,
    referrerName: match.referral?.referrerName || null,
    // More than one referral on the same number: link nothing, but keep the
    // count so a person can be pointed at it instead of it going unnoticed.
    referralMatches: match.matches,
    resumeUrl,
    resumeName,
    prescreenNotes,
    prescreenBy: prescreenNotes ? user.uid : null,
    prescreenByName: prescreenNotes ? user.name : null,
    prescreenAt: prescreenNotes ? now : null,
    startDate: null,
    terminationDate: null,
    termReasonId: null,
    createdAt: now,
    createdBy: user.uid,
    createdByName: user.name,
    demo: false,
  });

  if (firstIv) {
    await db.collection("candidates").doc(ref.id).collection("interviews").add({
      ...firstIv,
      status: "scheduled",
      score: null,
      scorecard: null,
      createdAt: now,
      createdBy: user.uid,
    });
  }

  await audit(db, user, "v2.candidate.add", ref.id, {
    name,
    dept,
    role,
    classId,
    firstInterview: firstIv ? `${INTERVIEW_LABEL[firstIv.type]} · ${firstIv.datetime}` : null,
    referralId: match.referral?.id || null,
    referrerName: match.referral?.referrerName || null,
    referralMatches: match.matches,
  });

  const added = firstIv
    ? `${name} added — ${INTERVIEW_LABEL[firstIv.type]} interview scheduled.`
    : `${name} added — schedule their first interview.`;

  return NextResponse.json({
    ok: true,
    id: ref.id,
    message: match.referral
      ? `${added} They were referred by ${match.referral.referrerName}.`
      : added,
  });
}
