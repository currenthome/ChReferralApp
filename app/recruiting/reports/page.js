"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import { monthOf } from "@/lib/reporting";
import ClassLookback from "@/components/recruiting/reports/ClassLookback";
import MonthlyRollup from "@/components/recruiting/reports/MonthlyRollup";
import Terminations from "@/components/recruiting/reports/Terminations";
import { AtsEntry, OverheadEditor, CostFieldsEditor, ReasonsEditor } from "@/components/recruiting/reports/Editors";

const MODES = [
  ["class", "By class"],
  ["month", "By month"],
  ["terms", "Who left"],
];

export default function Reports() {
  const { profile } = useAuth();
  const [raw, setRaw] = useState(null);
  const [mode, setMode] = useState("class");
  const [dept, setDept] = useState("all");
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setRaw(await api("/api/recruiting/reports"));
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    if (profile?.v2Visible) load();
  }, [profile, load]);

  async function changed(message) {
    setToast(message || "");
    setEditing(null);
    await load();
  }

  const isExec = profile?.v2Access === "exec";
  const allDepts = profile?.v2Access !== "dept-manager";

  // A department filter narrows what every view below works from, so the
  // numbers on screen always match the label above them.
  const data = raw && {
    ...raw,
    classes: raw.classes.filter((c) => dept === "all" || c.dept === dept),
  };
  const months = data
    ? [...new Set([...data.classes.map((c) => monthOf(c.date)), ...Object.keys(data.overhead)])].sort().reverse()
    : [];

  // Nothing on Reports is editable below exec, so don't offer it.
  const canEditClass = () => isExec;

  return (
    <Shell wide nav={false}>
      <V2Guard>
        <h1>Reports</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          How classes turned out — who stayed, what it cost, and where people drop off.
        </p>
        {toast && <div className="toast">{toast}</div>}
        {err && <div className="toast warn">{err}</div>}
        {!isExec && (
          <p className="rc-note" style={{ marginTop: -6, marginBottom: 16 }}>
            These figures are read-only for you. Ask Justin, Skip, Lauren, TJ or Brian to change anything.
          </p>
        )}

        <div className="rc-bar">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              className="rc-chip"
              onClick={() => setMode(id)}
              style={
                mode === id
                  ? { background: "var(--charcoal)", color: "#fff", borderColor: "var(--charcoal)", fontWeight: 700 }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
          {allDepts && (
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          )}
          <span className="grow" />
          {isExec && data?.classes.length > 0 && (
            <button className="rc-btnsm ghost" onClick={() => setEditing("ats")}>
              Enter ATS data
            </button>
          )}
          {isExec && (
            <button className="rc-btnsm ghost" onClick={() => setEditing("costFields")}>
              Cost categories
            </button>
          )}
        </div>

        {!data && !err && <div className="spinner">Loading…</div>}

        {data && mode === "class" && (
          <ClassLookback
            data={data}
            canEditClass={canEditClass}
            onEditOverhead={isExec ? () => setEditing("overhead") : null}
            onChanged={changed}
          />
        )}
        {data && mode === "month" && (
          <MonthlyRollup data={data} onEditOverhead={isExec ? () => setEditing("overhead") : null} />
        )}
        {data && mode === "terms" && (
          <Terminations data={data} onEditReasons={isExec ? () => setEditing("reasons") : null} />
        )}

        {editing === "ats" && (
          <AtsEntry
            classes={data.classes.filter(canEditClass)}
            onClose={() => setEditing(null)}
            onSaved={changed}
          />
        )}
        {editing === "overhead" && (
          <OverheadEditor
            months={months}
            overhead={data.overhead}
            costFields={data.costFields}
            onClose={() => setEditing(null)}
            onSaved={changed}
          />
        )}
        {editing === "costFields" && (
          <CostFieldsEditor
            costFields={data.costFields}
            onClose={() => setEditing(null)}
            onSaved={changed}
          />
        )}
        {editing === "reasons" && (
          <ReasonsEditor reasons={data.reasons} onClose={() => setEditing(null)} onSaved={changed} />
        )}
      </V2Guard>
    </Shell>
  );
}
