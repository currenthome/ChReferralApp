"use client";

import { useState } from "react";
import { api } from "@/lib/firebaseClient";
import { Modal } from "../ui";
import { directFields, overheadFields, monthLabel, monthOf } from "@/lib/reporting";

let seq = 0;
const newId = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// Numbers copied over from the applicant tracking system, per class. Entering
// them here is what makes every conversion and cost-per-stage figure work.
export function AtsEntry({ classes, onClose, onSaved }) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(classes.map((c) => [c.id, { ...(c.funnel || {}) }]))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (id, field, v) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], [field]: v.replace(/[^0-9]/g, "") } }));

  async function save() {
    setBusy(true);
    setErr("");
    try {
      for (const c of classes) {
        await api(`/api/recruiting/classes/${c.id}`, {
          method: "POST",
          body: { action: "funnel", ...rows[c.id] },
        });
      }
      onSaved("Applicant numbers saved.");
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Enter ATS data"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <p className="rc-note" style={{ marginTop: 0 }}>
        Copy the numbers across for each class. Per class rolls up into the monthly view on its own.
      </p>
      {classes.map((c) => (
        <div key={c.id} style={{ borderTop: "1px solid var(--gray)", paddingTop: 12, marginTop: 12 }}>
          <b style={{ fontSize: 13.5 }}>
            {monthLabel(monthOf(c.date))} · {c.role}
          </b>
          <div className="rc-note" style={{ marginBottom: 8 }}>
            {c.dept} · {c.location}
          </div>
          <div className="rc-inputs">
            {[
              ["applicants", "Applicants"],
              ["adApplications", "Applied via the ad"],
              ["prescreens", "Prescreens done"],
              ["interviewed", "Reached an interview"],
            ].map(([f, label]) => (
              <div key={f}>
                <label>{label}</label>
                <input
                  inputMode="numeric"
                  value={rows[c.id]?.[f] ?? ""}
                  onChange={(e) => set(c.id, f, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}

// What a class cost to run: only the categories entered per class.
export function ClassCosts({ cls, costFields, onClose, onSaved }) {
  const [costs, setCosts] = useState(() => ({ ...(cls.costs || {}) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await api(`/api/recruiting/classes/${cls.id}`, {
        method: "POST",
        body: { action: "costs", costs },
      });
      onSaved(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Class costs"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <div className="rc-inputs">
        {directFields(costFields).map((f) => (
          <div key={f.id}>
            <label>{f.label}</label>
            <input
              inputMode="numeric"
              value={costs[f.id] ?? ""}
              onChange={(e) =>
                setCosts({ ...costs, [f.id]: e.target.value.replace(/[^0-9]/g, "") })
              }
            />
          </div>
        ))}
      </div>
      <p className="rc-note" style={{ marginBottom: 0, marginTop: 14 }}>
        Payroll and tools are entered once a month, not here — they're shared across every class that
        month.
      </p>
    </Modal>
  );
}

export function OverheadEditor({ months, overhead, costFields, onClose, onSaved }) {
  const [pools, setPools] = useState(() => {
    const out = {};
    months.forEach((m) => {
      out[m] = { ...(overhead[m] || {}) };
    });
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fields = overheadFields(costFields);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      for (const m of months) {
        await api("/api/recruiting/overhead", {
          method: "POST",
          body: { month: m, amounts: pools[m] },
        });
      }
      onSaved("Monthly overhead saved.");
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Monthly overhead"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <p className="rc-note" style={{ marginTop: 0 }}>
        Enter these once a month. Each month's total splits across that month's classes by how many
        people each one hired. A month with no hires can't split anything.
      </p>
      {months.map((m) => (
        <div key={m} style={{ borderTop: "1px solid var(--gray)", paddingTop: 12, marginTop: 12 }}>
          <b style={{ fontSize: 13.5 }}>{monthLabel(m)}</b>
          <div className="rc-inputs" style={{ marginTop: 8 }}>
            {fields.map((f) => (
              <div key={f.id}>
                <label>{f.label}</label>
                <input
                  inputMode="numeric"
                  value={pools[m]?.[f.id] ?? ""}
                  onChange={(e) =>
                    setPools({
                      ...pools,
                      [m]: { ...pools[m], [f.id]: e.target.value.replace(/[^0-9]/g, "") },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}

// Shared settings: executives only, because a change here rewrites every
// department's report including months already closed.
export function CostFieldsEditor({ costFields, onClose, onSaved }) {
  const [fields, setFields] = useState(() => costFields.map((f) => ({ ...f })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/recruiting/config", { method: "POST", body: { costFields: fields } });
      onSaved(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Cost categories"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <p className="rc-note" style={{ marginTop: 0 }}>
        <b>Per class</b> is entered on each class — ad spend, referral fees. <b>Monthly</b> is entered once a
        month and split across that month's classes by hires — payroll, tools.
      </p>
      {fields.map((f, i) => (
        <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            value={f.label}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...f, label: e.target.value };
              setFields(next);
            }}
          />
          <select
            style={{ width: 150, flex: "none" }}
            value={f.type}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...f, type: e.target.value };
              setFields(next);
            }}
          >
            <option value="direct">Per class</option>
            <option value="overhead">Monthly</option>
          </select>
          <button
            className="rc-btnsm ghost"
            style={{ flex: "none" }}
            onClick={() => setFields(fields.filter((x) => x.id !== f.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="rc-btnsm ghost"
        style={{ marginTop: 12 }}
        onClick={() => setFields([...fields, { id: newId("cc"), label: "New cost", type: "direct" }])}
      >
        + Add category
      </button>
    </Modal>
  );
}

export function ReasonsEditor({ reasons, onClose, onSaved }) {
  const [list, setList] = useState(() => reasons.map((r) => ({ ...r })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/recruiting/config", { method: "POST", body: { reasons: list } });
      onSaved(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reasons people leave"
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <p className="rc-note" style={{ marginTop: 0 }}>
        Rename these or add your own — Relocated, Medical, Performance. They show up wherever someone's
        separation date gets set.
      </p>
      {list.map((r, i) => (
        <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            value={r.label}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...r, label: e.target.value };
              setList(next);
            }}
          />
          <button
            className="rc-btnsm ghost"
            style={{ flex: "none" }}
            onClick={() => setList(list.filter((x) => x.id !== r.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="rc-btnsm ghost"
        style={{ marginTop: 12 }}
        onClick={() => setList([...list, { id: newId("r"), label: "New reason" }])}
      >
        + Add reason
      </button>
    </Modal>
  );
}

// The three things only a person can tell us about someone they hired.
export function PersonOutcome({ person, reasons, onClose, onSaved }) {
  const [started, setStarted] = useState(person.started);
  const [graduated, setGraduated] = useState(person.graduated);
  const [term, setTerm] = useState(person.terminationDate || "");
  const [reason, setReason] = useState(person.termReasonId || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await api(`/api/recruiting/candidates/${person.id}`, {
        method: "POST",
        body: {
          action: "outcome",
          started,
          graduated,
          terminationDate: term,
          termReasonId: term ? reason : "",
        },
      });
      onSaved(res.message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={person.name}
      onClose={onClose}
      footer={
        <>
          <button className="rc-btnsm ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rc-btnsm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {err && <div className="toast warn">{err}</div>}
      <p className="rc-note" style={{ marginTop: 0 }}>
        {person.role} · first day {person.startDate || "not set"}
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14 }}>
        <input
          type="checkbox"
          checked={started}
          onChange={(e) => {
            setStarted(e.target.checked);
            if (!e.target.checked) setGraduated(false);
          }}
          style={{ width: "auto", padding: 0 }}
        />
        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--charcoal)" }}>
          Showed up and started
        </span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10, marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={graduated}
          disabled={!started}
          onChange={(e) => setGraduated(e.target.checked)}
          style={{ width: "auto", padding: 0 }}
        />
        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--charcoal)" }}>
          Graduated training
        </span>
      </label>

      <div className="field">
        <label>Separation date — leave blank if they're still here</label>
        <input type="date" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {term && (
        <div className="field">
          <label>Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">—</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="rc-note" style={{ marginBottom: 0 }}>
        This date is for recruiting's own retention reporting. It does not touch the referral side — if
        this person was referred, a manager still records their termination in Manage → Hires, the same
        way they do today.
      </p>
    </Modal>
  );
}
