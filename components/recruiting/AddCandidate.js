"use client";

import { useEffect, useState } from "react";
import { api, clientAuth, getViewAs } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import { INTERVIEW_TYPES, INTERVIEW_LABEL } from "@/lib/recruiting";
import { Modal, fmtDate, initials } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

// Adding a candidate is one form because that's one phone call: the recruiter
// finishes a pre-screen, types what they learned, and books the next interview
// before hanging up.
export default function AddCandidate({ profile, roles, classes, people, onClose, onAdded }) {
  const lockedDept = profile?.v2Access === "dept-manager" ? profile.dept : null;

  const [dept, setDept] = useState(lockedDept || DEPARTMENTS[0]);
  const [role, setRole] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", classId: "", prescreenNotes: "" });
  const [sched, setSched] = useState(true);
  const [iv, setIv] = useState({ type: "in_person", date: today(), time: "10:00", interviewer: "" });
  const [resume, setResume] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Referrals an employee has already submitted, so nobody retypes one.
  const [referrals, setReferrals] = useState([]);
  const [fromId, setFromId] = useState("");
  const [refQuery, setRefQuery] = useState("");
  const picked = referrals.find((r) => r.id === fromId) || null;

  // Search rather than a list: this grows every time somebody refers anyone,
  // and a dropdown of hundreds is no use on a phone. Matches on name or on
  // the digits of a phone number, however either was typed.
  const q = refQuery.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const matches = !q
    ? []
    : referrals
        .filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (qDigits.length >= 3 && (r.phoneKey || "").includes(qDigits))
        )
        .slice(0, 8);

  useEffect(() => {
    api("/api/recruiting/referrals")
      .then((d) => setReferrals(d.referrals))
      .catch(() => setReferrals([]));
  }, []);

  // Picking one fills in everything the referral already knows. Their
  // department comes across too, since that's the job they were referred for.
  function startFrom(id) {
    setFromId(id);
    const r = referrals.find((x) => x.id === id);
    if (!r) return;
    setForm((f) => ({ ...f, name: r.name, phone: r.phone }));
    // A class already chosen is the more specific decision, so it keeps the
    // department it set — a person referred for Sales can be hired into HR.
    if (!lockedDept && !form.classId && r.dept) setDept(r.dept);
  }

  function startFresh() {
    setFromId("");
    setRefQuery("");
    setForm((f) => ({ ...f, name: "", phone: "" }));
  }

  const deptRoles = roles[dept] || [];
  useEffect(() => {
    if (!deptRoles.includes(role)) setRole(deptRoles[0] || "");
  }, [dept, deptRoles, role]);

  // Every class still to come, whatever the department — a recruiter thinks
  // "put them in that class", so the class is what they pick, and the
  // department and role follow from it.
  const classOpts = classes
    .filter((c) => c.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date));
  const chosenClass = classOpts.find((c) => c.id === form.classId) || null;

  function pickClass(id) {
    setForm((f) => ({ ...f, classId: id }));
    const c = classOpts.find((x) => x.id === id);
    if (!c) return;
    if (!lockedDept) setDept(c.dept);
    setRole(c.role);
  }

  const interviewers = people.filter((p) => p.allDepts || p.dept === dept);
  useEffect(() => {
    if (!interviewers.some((p) => p.uid === iv.interviewer)) {
      setIv((v) => ({ ...v, interviewer: interviewers[0]?.uid || "" }));
    }
  }, [interviewers, iv.interviewer]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setErr("");
    try {
      // Multipart so the resume rides along with the rest of the form.
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("phone", form.phone);
      fd.append("email", form.email);
      fd.append("dept", dept);
      fd.append("role", role);
      fd.append("classId", form.classId);
      fd.append("prescreenNotes", form.prescreenNotes);
      if (fromId) fd.append("referralId", fromId);
      if (sched) {
        fd.append("ivType", iv.type);
        fd.append("ivDate", iv.date);
        fd.append("ivTime", iv.time);
        fd.append("ivInterviewer", iv.interviewer);
      }
      if (resume) fd.append("resume", resume);

      const token = await clientAuth().currentUser?.getIdToken();
      const viewAs = getViewAs();
      const res = await fetch("/api/recruiting/candidates", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(viewAs ? { "X-View-As": viewAs.uid } : {}),
        },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      onAdded(data.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add candidate"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Adding…" : "Add candidate"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}

      {picked ? (
        <div className="field">
          <label>Starting from a referral</label>
          <div className="rc-oh" style={{ marginTop: 0 }}>
            <b>{picked.name}</b> · {picked.phone} · {picked.dept} · referred by {picked.referrerName} ·
            currently at “{picked.stage}”
            {picked.resumeName ? ` · resume ${picked.resumeName} comes across` : " · no resume on file"}
          </div>
          <div className="rc-hint">
            {picked.referrerName} gets their points automatically when this person is hired.{" "}
            <button className="link" style={{ fontWeight: 700 }} onClick={startFresh}>
              Choose someone else
            </button>
          </div>
        </div>
      ) : (
        referrals.length > 0 && (
          <div className="field">
            <label>Were they referred by an employee?</label>
            <input
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              placeholder="Search by name or phone number"
            />
            <div className="rc-hint">
              {referrals.length} referral{referrals.length === 1 ? "" : "s"} waiting to be worked. Find them
              here and the referrer gets paid for certain — otherwise just fill the form in below.
            </div>

            {q && (
              <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                {matches.length ? (
                  matches.map((r) => (
                    <button key={r.id} className="rc-candrow" onClick={() => startFrom(r.id)}>
                      <span className="rc-ci">{initials(r.name)}</span>
                      <span className="rc-crmain">
                        <span className="nm">{r.name}</span>
                        <span className="sb">
                          {r.phone} · {r.dept} · referred by {r.referrerName}
                        </span>
                      </span>
                      <span className="rc-stage s-interviewing">{r.stage}</span>
                    </button>
                  ))
                ) : (
                  <div className="rc-empty">No referral matches “{refQuery.trim()}”.</div>
                )}
              </div>
            )}
          </div>
        )
      )}

      <div className="field">
        <label>Full name</label>
        <input value={form.name} onChange={set("name")} placeholder="First Last" />
      </div>
      <div className="rc-f2">
        <div className="field">
          <label>Mobile</label>
          <input value={form.phone} onChange={set("phone")} placeholder="(000) 555-0000" inputMode="tel" />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={form.email} onChange={set("email")} placeholder="name@email.com" />
        </div>
      </div>
      <div className="field">
        <label>Which class are they for?</label>
        <select value={form.classId} onChange={(e) => pickClass(e.target.value)}>
          <option value="">Not in a class</option>
          {classOpts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.role} · {fmtDate(c.date).mon} {fmtDate(c.date).day} · {c.location}
              {lockedDept ? "" : ` (${c.dept})`}
            </option>
          ))}
        </select>
        <div className="rc-hint">
          {classOpts.length === 0
            ? "No classes coming up yet — request one on the Classes screen, or leave this as it is."
            : chosenClass
            ? "This sets their department and role to match the class."
            : "Pick the class and the department and role fill themselves in. Leave it unset for a hire with no class."}
        </div>
      </div>

      <div className="rc-f2">
        <div className="field">
          <label>Department</label>
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            disabled={!!lockedDept || !!chosenClass}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {lockedDept && <div className="rc-hint">Locked to your department.</div>}
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={!!chosenClass}>
            {deptRoles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      {chosenClass && (
        <div className="rc-hint" style={{ margin: "-8px 0 18px" }}>
          Set by the {chosenClass.role} class on {fmtDate(chosenClass.date).full}. Change the class above to
          change these.
        </div>
      )}

      <div className="field">
        <label>Resume</label>
        <label className={`rc-drop${resume ? " has" : ""}`}>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            style={{ display: "none" }}
            onChange={(e) => setResume(e.target.files?.[0] || null)}
          />
          {resume ? `${resume.name} · tap to replace` : "Choose a file — PDF or Word"}
        </label>
      </div>

      <div className="field">
        <label>Phone pre-screen notes</label>
        <textarea
          value={form.prescreenNotes}
          onChange={set("prescreenNotes")}
          placeholder="What you learned on the call…"
        />
        <div className="rc-hint">Candidates get added after a pre-screen — this is that context.</div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: sched ? 14 : 0 }}>
        <input
          type="checkbox"
          checked={sched}
          onChange={(e) => setSched(e.target.checked)}
          style={{ width: "auto", padding: 0 }}
        />
        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--charcoal)" }}>
          Schedule the first interview now
        </span>
      </label>

      {sched && (
        <>
          <div className="rc-f2">
            <div className="field">
              <label>Type</label>
              <select value={iv.type} onChange={(e) => setIv({ ...iv, type: e.target.value })}>
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INTERVIEW_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Interviewer</label>
              <select value={iv.interviewer} onChange={(e) => setIv({ ...iv, interviewer: e.target.value })}>
                {interviewers.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rc-f2">
            <div className="field">
              <label>Date</label>
              <input type="date" value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={iv.time} onChange={(e) => setIv({ ...iv, time: e.target.value })} />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
