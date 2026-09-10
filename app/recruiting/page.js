"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { Modal } from "@/components/recruiting/ui";

// The recruiting hub. Each screen arrives with its build step; this hub and
// the access gate around it are step 1. Kept separate from /manage on purpose:
// recruiting access is its own thing, so a recruiter needs no manager role and
// a manager gets nothing here without a recruiting level.
const SCREENS = [
  { href: "/recruiting/classes", title: "Classes", sub: "Request a class and watch it fill.", primary: true },
  { href: "/recruiting/pipeline", title: "Pipeline", sub: "Every active candidate by stage." },
  { href: "/recruiting/scorecards", title: "Scorecards", sub: "Build the interview form for each role." },
  { href: "/recruiting/reports", title: "Reports", sub: "Class look-back, monthly rollup, terminations." },
  { href: "/recruiting/forecast", title: "Forecast", sub: "Work a headcount goal back through the funnel." },
  { href: "/recruiting/activity", title: "Activity", sub: "Who changed what, newest first." },
];

const LEVEL_LABEL = {
  exec: "Executive — everything, including shared settings",
  recruiter: "Recruiter — every department, day to day",
  "dept-manager": "Department manager — your own department",
};

// The demo data and the button that clears it. Only executives see this, and
// only while there's demo data left to clear — after the launch purge it
// disappears on its own.
function DemoPurge() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  const load = () => api("/api/recruiting/demo").then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    load();
  }, []);

  async function purge() {
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/recruiting/demo", { method: "DELETE", body: { confirm } });
      setOpen(false);
      setConfirm("");
      setToast(res.message);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!info?.canPurge || !info.total) return toast ? <div className="toast">{toast}</div> : null;

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <div className="toast warn" style={{ marginTop: 18 }}>
        <b>{info.total} demo records</b> are in here for UAT — classes, candidates, interviews, scorecard
        forms and overhead, all tagged as demo. Clear them before launch.{" "}
        <button className="link" style={{ fontWeight: 700 }} onClick={() => setOpen(true)}>
          Purge demo data
        </button>
      </div>

      {open && (
        <Modal
          title="Purge demo data"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="rc-btnsm ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="rc-btnsm danger" onClick={purge} disabled={busy || confirm.trim().toUpperCase() !== "PURGE"}>
                {busy ? "Purging…" : "Purge"}
              </button>
            </>
          }
        >
          {err && <div className="toast warn">{err}</div>}
          <p className="rc-note" style={{ marginTop: 0 }}>
            This removes every record tagged as demo and nothing else. Real candidates, classes, referrals
            and points are untouched. It can't be undone.
          </p>
          <div className="rc-tablewrap" style={{ margin: "14px 0" }}>
            {Object.entries(info.counts).map(([name, n]) => (
              <div key={name} className="rc-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>{name}</span>
                <span className="n">{n}</span>
              </div>
            ))}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Type PURGE to confirm</label>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="PURGE" />
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Recruiting() {
  const { profile } = useAuth();

  return (
    <Shell>
      <V2Guard>
        <h1>Recruiting</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Classes, candidates, interviews, and reporting.
        </p>
        <div
          style={{
            background: "var(--cyanlight)",
            border: "1px solid var(--cyan)",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 18,
            fontWeight: 300,
            fontSize: 13,
            color: "var(--slate)",
          }}
        >
          Your access: <b style={{ fontWeight: 700, color: "var(--charcoal)" }}>{LEVEL_LABEL[profile?.v2Access] || "—"}</b>
          {profile?.v2Access === "dept-manager" && profile?.dept ? ` · ${profile.dept}` : ""}
        </div>
        <div className="tiles">
        {SCREENS.map((s) => (
          <Link key={s.href} href={s.href} style={{ textDecoration: "none", display: "block" }}>
            <div className={`action${s.primary ? " primary" : ""}`}>
              <span>
                <span className="at">{s.title}</span>
                <span className="as">{s.sub}</span>
              </span>
              <span className="chev">›</span>
            </div>
          </Link>
        ))}
        </div>
        <DemoPurge />
      </V2Guard>
    </Shell>
  );
}
