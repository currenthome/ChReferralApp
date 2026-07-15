"use client";

import { useState } from "react";
import Shell from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS, phoneKey } from "@/lib/constants";

function formatAsTyped(value) {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function Submit() {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dept, setDept] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit() {
    const errs = {};
    if (name.trim().length < 2) errs.name = true;
    if (phoneKey(phone).length !== 10) errs.phone = true;
    if (!dept) errs.dept = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const data = await api("/api/referrals", {
        method: "POST",
        body: { candidateName: name.trim(), candidatePhone: phone, dept },
      });
      setResult(data);
    } catch (e) {
      setErrors({ submit: e.message });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setPhone("");
    setDept("");
    setErrors({});
    setResult(null);
  }

  if (result) {
    return (
      <Shell>
        <div className="center">
          <div className="check">✓</div>
          <h1 style={{ fontSize: 22 }}>{result.duplicate ? "Already referred" : "Referral submitted!"}</h1>
          <p className="sub" style={{ marginBottom: 28 }}>
            {result.duplicate
              ? result.message
              : "A manager will reach out soon. We'll keep you posted as they move through the process."}
          </p>
          <button className="btnghost" onClick={reset}>Refer someone else</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1>Refer someone great</h1>
      <div className="refcard" style={{ marginTop: 18 }}>
        <div className="cap">REFERRING AS</div>
        <div className="row">
          <div>
            <div className="nm">{profile?.name}</div>
            <div className="dp">{profile?.dept || "—"}</div>
          </div>
          <div className="af">auto-filled</div>
        </div>
      </div>

      {errors.submit && <div className="toast warn">{errors.submit}</div>}

      <div className="field">
        <label>Their name</label>
        <input className={errors.name ? "bad" : ""} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" />
        {errors.name && <div className="err">Enter the person's name.</div>}
      </div>
      <div className="field">
        <label>Their mobile number</label>
        <input
          className={errors.phone ? "bad" : ""}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(formatAsTyped(e.target.value))}
          placeholder="(555) 123-4567"
        />
        {errors.phone && <div className="err">Enter a valid 10-digit mobile number.</div>}
      </div>
      <div className="field">
        <label>Which team are they a fit for?</label>
        <select className={errors.dept ? "bad" : ""} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Select a department</option>
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {errors.dept && <div className="err">Pick a department.</div>}
      </div>

      <button className="btn" onClick={handleSubmit} disabled={busy}>
        {busy ? "Submitting…" : "Submit referral"}
      </button>
      <p className="note">You earn points the moment this lands — and more as they get hired.</p>
    </Shell>
  );
}
