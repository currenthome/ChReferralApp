"use client";

import { useEffect, useState, use } from "react";
import { DEPARTMENTS, phoneKey } from "@/lib/constants";

function formatAsTyped(value) {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Public page — no login. Candidates land here from a rep's link or QR code.
export default function Apply({ params }) {
  const { code } = use(params);
  const [referrerName, setReferrerName] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dept, setDept] = useState("");
  const [resume, setResume] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/apply?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setReferrerName(d.referrerName))
      .catch(() => setInvalid(true));
  }, [code]);

  async function submit() {
    const errs = {};
    if (name.trim().length < 2) errs.name = true;
    if (phoneKey(phone).length !== 10) errs.phone = true;
    if (!dept) errs.dept = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.set("code", code);
      form.set("candidateName", name.trim());
      form.set("candidatePhone", phone);
      form.set("dept", dept);
      form.set("website", "");
      if (resume) form.set("resume", resume);
      const res = await fetch("/api/apply", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setDone(true);
    } catch (e) {
      setErrors({ submit: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ textAlign: "center", margin: "26px 0 12px" }}>
        <div className="wordmark">
          <span style={{ color: "var(--charcoal)" }}>CURRENT</span>
          <span style={{ color: "var(--cyan)" }}>HOME</span>
        </div>
        <div style={{ fontWeight: 500, fontSize: 10.5, color: "var(--slate)", letterSpacing: 2, marginTop: 3 }}>NOW HIRING</div>
      </div>

      <div className="wrap" style={{ paddingTop: 6 }}>
        {invalid && (
          <div className="center">
            <h1 style={{ fontSize: 22 }}>Link not found</h1>
            <p className="sub">This referral link isn't valid. Ask your contact at Current Home for a fresh one.</p>
          </div>
        )}

        {!invalid && done && (
          <div className="center">
            <div className="check">✓</div>
            <h1 style={{ fontSize: 22 }}>Application received!</h1>
            <p className="sub" style={{ marginBottom: 18 }}>
              Thanks for applying. {referrerName ? `${referrerName.split(" ")[0]} and the` : "The"} Current Home team will reach out soon.
            </p>
            <p style={{ margin: 0 }}>
              <a href="https://currenthome.com" target="_blank" rel="noopener" style={{ fontFamily: "inherit", fontWeight: 500, fontSize: 14, color: "#0a9db3", textDecoration: "none" }}>
                Learn more about Current Home ›
              </a>
            </p>
          </div>
        )}

        {!invalid && !done && (
          <>
            <h1 style={{ textAlign: "center", marginBottom: 6 }}>Join our team</h1>
            <p className="sub" style={{ textAlign: "center", marginBottom: 8 }}>
              {referrerName ? <>Referred by <b style={{ color: "var(--charcoal)" }}>{referrerName}</b> — </> : ""}apply in under a minute.
            </p>
            <p style={{ textAlign: "center", margin: "0 0 22px" }}>
              <a href="https://currenthome.com" target="_blank" rel="noopener" style={{ fontFamily: "inherit", fontWeight: 500, fontSize: 13.5, color: "#0a9db3", textDecoration: "none" }}>
                New here? Learn more about Current Home ›
              </a>
            </p>

            {errors.submit && <div className="toast warn">{errors.submit}</div>}

            <div className="field">
              <label>Your name</label>
              <input className={errors.name ? "bad" : ""} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              {errors.name && <div className="err">Enter your name.</div>}
            </div>
            <div className="field">
              <label>Mobile number</label>
              <input className={errors.phone ? "bad" : ""} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(formatAsTyped(e.target.value))} placeholder="(555) 123-4567" />
              {errors.phone && <div className="err">Enter a valid 10-digit number.</div>}
            </div>
            <div className="field">
              <label>Role you're interested in</label>
              <select className={errors.dept ? "bad" : ""} value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">Select a team</option>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
              {errors.dept && <div className="err">Pick a team.</div>}
            </div>

            <div className="field">
              <label>Resume (optional)</label>
              <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)} />
              {resume && <div className="note" style={{ textAlign: "left", marginTop: 6 }}>Attached: {resume.name}</div>}
            </div>

            <button className="btn" onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Apply now"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
