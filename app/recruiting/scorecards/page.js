"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";
import { INTERVIEW_TYPES, INTERVIEW_LABEL, ITEM_TYPES, ITEM_LABEL } from "@/lib/recruiting";

let seq = 0;
const newId = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function Scorecards() {
  const { profile } = useAuth();
  const lockedDept = profile?.v2Access === "dept-manager" ? profile.dept : null;

  const [roles, setRoles] = useState({});
  const [dept, setDept] = useState(lockedDept || DEPARTMENTS[0]);
  const [role, setRole] = useState("");
  const [ivType, setIvType] = useState("phone");
  const [form, setForm] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!profile?.v2Visible) return;
    api("/api/recruiting/roles")
      .then((r) => setRoles(r.roles))
      .catch((e) => setErr(e.message));
  }, [profile]);

  useEffect(() => {
    if (lockedDept) setDept(lockedDept);
  }, [lockedDept]);

  const deptRoles = roles[dept] || [];
  useEffect(() => {
    if (!deptRoles.includes(role)) setRole(deptRoles[0] || "");
  }, [dept, deptRoles, role]);

  const load = useCallback(async () => {
    if (!dept || !role || !ivType) return;
    setErr("");
    try {
      const q = new URLSearchParams({ dept, role, ivType });
      const d = await api(`/api/recruiting/scorecards?${q}`);
      setForm(d.form);
      setCanEdit(d.canEdit);
      setDirty(false);
    } catch (e) {
      setErr(e.message);
    }
  }, [dept, role, ivType]);

  useEffect(() => {
    if (role) load();
  }, [load, role]);

  const published = form?.status === "published";
  // Published means locked. Reopening it is a deliberate click, and only
  // changes what future interviews are scored against.
  const editable = canEdit && !published;

  function update(fn) {
    setForm((f) => {
      const next = { ...f, sections: JSON.parse(JSON.stringify(f.sections || [])) };
      fn(next);
      return next;
    });
    setDirty(true);
  }

  async function save(status) {
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/recruiting/scorecards", {
        method: "POST",
        body: { dept, role, ivType, sections: form.sections, status },
      });
      setToast(res.message);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell wide nav={false}>
      <V2Guard>
        <h1>Scorecards</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Build the interview form for each role and each kind of interview. Label your own sections and add any
          mix of graded, yes/no, and note questions. When someone gets scored, the matching form loads itself.
        </p>
        {toast && <div className="toast">{toast}</div>}
        {err && <div className="toast warn">{err}</div>}

        <div className="rc-bar">
          <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={!!lockedDept}>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {deptRoles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={ivType} onChange={(e) => setIvType(e.target.value)}>
            {INTERVIEW_TYPES.map((t) => (
              <option key={t} value={t}>
                {INTERVIEW_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {!form && <div className="spinner">Loading…</div>}

        {form && (
          <>
            <div className="rc-bar" style={{ marginBottom: 14 }}>
              <b style={{ fontSize: 15 }}>
                {role} · {INTERVIEW_LABEL[ivType]}
              </b>
              <span className={`rc-stage ${published ? "s-hired" : "s-offer_extended"}`}>
                {published ? "Published" : "Draft"}
              </span>
              <span className="grow" />
              {canEdit && published && (
                <button className="rc-btnsm ghost" disabled={busy} onClick={() => save("draft")}>
                  Reopen for edits
                </button>
              )}
              {canEdit && !published && (
                <>
                  <button className="rc-btnsm ghost" disabled={busy || !dirty} onClick={() => save("draft")}>
                    Save draft
                  </button>
                  <button className="rc-btnsm" disabled={busy} onClick={() => save("published")}>
                    Publish &amp; lock
                  </button>
                </>
              )}
            </div>

            {form.sections?.map((s) => (
              <div key={s.id} className="mcard">
                <div className="rtop" style={{ alignItems: "center", gap: 10 }}>
                  {editable ? (
                    <input
                      value={s.label}
                      onChange={(e) =>
                        update((f) => {
                          f.sections.find((x) => x.id === s.id).label = e.target.value;
                        })
                      }
                      style={{ fontWeight: 700, fontSize: 15 }}
                    />
                  ) : (
                    <div className="rname">{s.label}</div>
                  )}
                  {editable && (
                    <button
                      className="rc-btnsm danger"
                      onClick={() =>
                        update((f) => {
                          f.sections = f.sections.filter((x) => x.id !== s.id);
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  {s.items.length ? (
                    s.items.map((it) => (
                      <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <span className="rc-stage" style={{ flex: "none" }}>
                          {ITEM_LABEL[it.type]}
                        </span>
                        {editable ? (
                          <input
                            value={it.text}
                            placeholder="Type the question…"
                            onChange={(e) =>
                              update((f) => {
                                const sec = f.sections.find((x) => x.id === s.id);
                                sec.items.find((y) => y.id === it.id).text = e.target.value;
                              })
                            }
                          />
                        ) : (
                          <span style={{ flex: 1, fontSize: 13.5 }}>{it.text || <i>(no wording yet)</i>}</span>
                        )}
                        {editable && (
                          <button
                            className="rc-btnsm ghost"
                            style={{ flex: "none" }}
                            onClick={() =>
                              update((f) => {
                                const sec = f.sections.find((x) => x.id === s.id);
                                sec.items = sec.items.filter((y) => y.id !== it.id);
                              })
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rc-empty">No questions in this section yet.</div>
                  )}
                </div>

                {editable && (
                  <div className="rc-bar" style={{ marginTop: 10, marginBottom: 0 }}>
                    {ITEM_TYPES.map((t) => (
                      <button
                        key={t}
                        className="rc-btnsm ghost"
                        onClick={() =>
                          update((f) => {
                            f.sections.find((x) => x.id === s.id).items.push({ id: newId("i"), type: t, text: "" });
                          })
                        }
                      >
                        + {ITEM_LABEL[t]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {!form.sections?.length && (
              <p className="rc-note">
                No sections yet for this interview.{editable ? " Add the first one below." : ""}
              </p>
            )}

            {editable && (
              <button
                className="rc-btnsm ghost"
                onClick={() =>
                  update((f) => {
                    f.sections = [...(f.sections || []), { id: newId("s"), label: "New section", items: [] }];
                  })
                }
              >
                + Add section
              </button>
            )}

            <p className="rc-note" style={{ marginTop: 18 }}>
              {!canEdit
                ? "View only — you can build forms for roles in your own department."
                : published
                ? "This form is published and locked. Reopening it only changes interviews scored from then on — anyone already scored keeps exactly the form they were scored on."
                : "This is a draft. Build it out, then publish to lock it for the team."}
            </p>
          </>
        )}
      </V2Guard>
    </Shell>
  );
}
