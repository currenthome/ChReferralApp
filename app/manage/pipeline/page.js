"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";
import { api } from "@/lib/firebaseClient";
import { STAGES, HIRED_STAGE, DEPARTMENTS } from "@/lib/constants";

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const COLS = [
  { key: "candidateName", label: "Candidate" },
  { key: "dept", label: "Dept" },
  { key: "referrerName", label: "Referred by" },
  { key: "stage", label: "Stage" },
  { key: "daysInStage", label: "Days in stage" },
  { key: "lead", label: "Lead" },
  { key: "ownerName", label: "Worked by" },
];

// Company-wide oversight table: every referral, sortable, staleness-colored,
// with nudge and jump-in. Built for desktop triage.
export default function Pipeline() {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [dept, setDept] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [sortKey, setSortKey] = useState("daysInStage");
  const [sortDir, setSortDir] = useState(-1);

  const load = () => api("/api/manage/referrals?scope=company").then(setData).catch(() => setData({ referrals: [] }));
  useEffect(() => { load(); }, []);

  async function onAction(r, action, extra = {}) {
    setBusy(true);
    setToast("");
    try {
      const res = await api(`/api/manage/referrals/${r.id}`, { method: "POST", body: { action, ...extra } });
      setToast(res.message || "Done.");
      await load();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => {
    let list = (data?.referrals || []).map((r) => ({
      ...r,
      daysInStage: daysSince(r.stageChangedAt),
      stageLabel: r.out ? "Not moving forward" : STAGES[r.stage],
      open: !r.out && r.stage < HIRED_STAGE,
    }));
    if (dept !== "All") list = list.filter((r) => r.dept === dept);
    if (stageFilter !== "All") list = list.filter((r) => r.stageLabel === stageFilter);
    if (needsOnly) list = list.filter((r) => r.open && r.daysInStage >= 7);
    return list.sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
  }, [data, dept, stageFilter, needsOnly, sortKey, sortDir]);

  const total = data?.referrals?.length || 0;
  const attn = (data?.referrals || []).filter((r) => !r.out && r.stage < HIRED_STAGE && daysSince(r.stageChangedAt) >= 7).length;

  function clickSort(key) {
    if (sortKey === key) setSortDir(-sortDir);
    else {
      setSortKey(key);
      setSortDir(key === "daysInStage" ? -1 : 1);
    }
  }

  return (
    <Shell wide nav={false}>
      <ManagerGuard>
        <h1>Company pipeline</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Every referral across the company. Sort any column, filter, and nudge the team on stale ones.
        </p>
        {toast && <div className="toast">{toast}</div>}

        <div style={{ background: "var(--cyanlight)", border: "1px solid var(--cyan)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontWeight: 300, fontSize: 13, color: "var(--slate)" }}>
          <b style={{ fontWeight: 700, color: "var(--charcoal)" }}>{total}</b> referrals company-wide · <b style={{ fontWeight: 700, color: attn > 0 ? "#c0392b" : "var(--charcoal)" }}>{attn}</b> need attention (7+ days untouched)
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: "auto", padding: "8px 10px", fontSize: 13 }}>
            <option>All</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ width: "auto", padding: "8px 10px", fontSize: 13 }}>
            <option value="All">All stages</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
            <option>Not moving forward</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 500, fontSize: 13, cursor: "pointer", margin: 0 }}>
            <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} style={{ width: "auto" }} />
            Needs attention only
          </label>
        </div>

        {!data && <div className="spinner">Loading…</div>}

        {data && (
          <div style={{ overflowX: "auto", border: "1px solid var(--gray)", borderRadius: 14, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => clickSort(c.key)}
                      style={{ textAlign: "left", padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.5, color: "var(--slate)", cursor: "pointer", textTransform: "uppercase", background: "var(--offwhite)" }}
                    >
                      {c.label}{sortKey === c.key ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", background: "var(--offwhite)" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cls = !r.open ? "var(--slate)" : r.daysInStage >= 7 ? "#c0392b" : r.daysInStage >= 3 ? "#b26a00" : "var(--slate)";
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", fontWeight: 700, whiteSpace: "nowrap" }}>{r.candidateName}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap" }}>{r.dept}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap" }}>{r.referrerName}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap", fontWeight: 500, color: r.stageLabel === "Hired" ? "#1e7d34" : r.out ? "#c0392b" : "inherit" }}>{r.stageLabel}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", fontWeight: 700, color: cls }}>{r.open ? `${r.daysInStage}d` : "—"}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 9, letterSpacing: 0.5, padding: "3px 7px", borderRadius: 999, ...(r.lead === "recruiting" ? { background: "#efe9ff", color: "#5b3fbf" } : { background: "var(--cyanlight)", color: "#0a7d8f" }) }}>
                          {r.lead === "recruiting" ? "RECRUITING" : "MANAGER"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap" }}>{r.ownerName || "—"}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--gray)", whiteSpace: "nowrap" }}>
                        {r.open && (
                          <>
                            <button disabled={busy} onClick={() => onAction(r, "nudge")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 11, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--gray)", background: "#fff", cursor: "pointer", marginRight: 6 }}>
                              Nudge
                            </button>
                            {r.lead === "recruiting" ? (
                              <button disabled={busy} onClick={() => onAction(r, "setLead", { lead: "manager" })} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 11, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--cyan)", background: "var(--cyan)", cursor: "pointer" }}>
                                Jump in
                              </button>
                            ) : (
                              <button disabled={busy} onClick={() => onAction(r, "claim")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 11, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--gray)", background: "#fff", cursor: "pointer" }}>
                                Claim
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <button className="btnghost" style={{ width: "100%", marginTop: 16 }} onClick={() => history.back()}>Back</button>
      </ManagerGuard>
    </Shell>
  );
}
