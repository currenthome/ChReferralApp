"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";
import { DEPARTMENTS } from "@/lib/constants";

function DeptPicker() {
  const { refreshProfile } = useAuth();
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!dept) return;
    setBusy(true);
    setErr("");
    try {
      await api("/api/me", { method: "POST", body: { dept } });
      await refreshProfile();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="invitebox" style={{ marginBottom: 18 }}>
      <h3>One quick thing — what team are you on?</h3>
      {err && <div className="toast warn">{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Select your department</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button className="btnghost" style={{ flex: "none" }} disabled={busy || !dept} onClick={save}>Save</button>
      </div>
      <p className="note" style={{ textAlign: "left" }}>This sets your leaderboard and which challenges you see.</p>
    </div>
  );
}

function ActionButton({ href, title, sub, primary, manage }) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      <div className={`action${primary ? " primary" : ""}${manage ? " manage" : ""}`}>
        <span>
          <span className="at" style={manage ? { color: "#fff" } : undefined}>{title}</span>
          <span className="as" style={manage ? { color: "#c7c9d6" } : undefined}>{sub}</span>
        </span>
        <span className="chev" style={manage ? { color: "#fff" } : undefined}>›</span>
      </div>
    </Link>
  );
}

export default function Home() {
  const { profile, logout } = useAuth();
  const [board, setBoard] = useState(null);
  const [money, setMoney] = useState(null);

  useEffect(() => {
    if (!profile) return;
    api("/api/leaderboard?range=month&scope=dept")
      .then(setBoard)
      .catch(() => setBoard({ rows: [] }));
    // Own referrals and own ledger only — no collection scans.
    api("/api/earnings")
      .then(setMoney)
      .catch(() => setMoney(null));
  }, [profile]);

  const rows = board?.rows || [];
  const me = rows.find((r) => r.you);
  const top = rows[0]?.points || 0;
  const firstName = (profile?.name || "").split(" ")[0];
  const ahead = me && me.rank > 1 ? rows[me.rank - 2] : null;
  const open = (money?.referrals || []).filter((r) => !r.out && !r.hired && !r.terminated).length;

  return (
    <Shell wide>
      <p className="greet">Welcome back,</p>
      <p className="greetname">{firstName || "there"}</p>

      {profile && !profile.dept && <DeptPicker />}

      {/* Phone. Byte for byte what it was — the desktop block below is a
          separate layout rather than this one stretched wider. */}
      <div className="mobonly">
      <div className="homesplit">
      <div>
      <div className="hero">
        <div>
          <div className="rank">{me ? `#${me.rank}` : "—"}</div>
          <div className="rlbl">of {rows.length || "—"} in {board?.scope || "your team"}</div>
        </div>
        <div>
          <div className="pts">{me?.points ?? 0}</div>
          <div className="plbl">points this month</div>
        </div>
      </div>

      {ahead && (
        <p className="gap" style={{ fontWeight: 300, fontSize: 13, color: "var(--slate)", margin: "12px 2px 4px" }}>
          You're <b>{ahead.points - me.points} pts</b> behind #{ahead.rank} {ahead.name.split(" ")[0]} — one referral could flip it.
        </p>
      )}
      {me && me.rank === 1 && rows.length > 1 && (
        <p className="gap" style={{ fontWeight: 300, fontSize: 13, color: "var(--slate)", margin: "12px 2px 4px" }}>
          You're in the lead — {rows[1].name.split(" ")[0]} is {me.points - rows[1].points} pts behind you. 🏆
        </p>
      )}

      </div>

      {rows.length > 0 && (
        <div className="card lbcard" style={{ marginTop: 22 }}>
          <h3>You vs the field · {board.scope}</h3>
          {rows.slice(0, 8).map((r) => (
            <div key={r.uid} className={`crow${r.you ? " you" : ""}`}>
              <div className="cn">{r.you ? "You" : r.name.split(" ")[0]}</div>
              <div className="ctrack">
                <span className="cfill" style={{ width: `${top ? Math.max(4, (r.points / top) * 100) : 4}%` }} />
              </div>
              <div className="cp">{r.points}</div>
            </div>
          ))}
        </div>
      )}
      </div>

      <div className="tiles">
      <ActionButton primary href="/submit" title="Submit a referral" sub="Know someone great? Add them in seconds." />
      <ActionButton href="/my-referrals" title="My referrals" sub="Track everyone you've referred and their status." />
      <ActionButton href="/earnings" title="My earnings" sub="See cash earned and what's still in your pipeline." />
      <ActionButton href="/prizes" title="Prizes & goals" sub="See what you can win and how close you are." />
      <ActionButton href="/share" title="Share & recruit" sub="Get your personal link and QR code to post." />
      <ActionButton href="/leaderboard" title="Leaderboard" sub="See how you stack up against the team." />
      {(profile?.role === "manager" || profile?.role === "admin") && (
        <ActionButton manage href="/manage" title="Manage" sub="Update funnel stages, invite and manage people." />
      )}
      {profile?.v2Visible && (
        <ActionButton manage href="/recruiting" title="Recruiting" sub="Classes, candidates, scorecards, and reporting." />
      )}

      </div>
      </div>

      {/* Desktop. A strip of figures, the standings as a table, and one column
          for the thing you came here to do. */}
      <div className="deskonly">
        <div className="hstats">
          <div className="hstat lead">
            <div className="l">Your rank</div>
            <div className="v">{me ? `#${me.rank}` : "—"} <small>of {rows.length || "—"} in {board?.scope || "your team"}</small></div>
            <div className="s">
              {ahead
                ? ahead.points === me.points
                  ? `Level with ${ahead.name.split(" ")[0]} — one referral puts you ahead`
                  : `${ahead.points - me.points} pts behind ${ahead.name.split(" ")[0]}`
                : me && rows.length > 1
                ? `${me.points - rows[1].points} pts clear of ${rows[1].name.split(" ")[0]}`
                : " "}
            </div>
          </div>
          <div className="hstat">
            <div className="l">Points this month</div>
            <div className="v">{me?.points ?? 0}</div>
            <div className="s">{new Date().toLocaleString("en", { month: "long" })}</div>
          </div>
          <div className="hstat">
            <div className="l">In your pipeline</div>
            <div className="v">{money ? open : "—"}</div>
            <div className="s">Referrals still in play</div>
          </div>
          <div className="hstat">
            <div className="l">Cash paid to you</div>
            <div className="v">{money ? `$${money.earned.toLocaleString()}` : "—"}</div>
            <div className="s">
              {money && money.pipeline > 0 ? `$${money.pipeline.toLocaleString()} more in the pipeline` : "All time"}
            </div>
          </div>
        </div>

        <div className="hcols">
          <div className="hpanel">
            <h4>You vs the field · {board?.scope || "your team"} · {new Date().toLocaleString("en", { month: "long" })}</h4>
            {rows.length === 0 ? (
              <p className="hempty">Nobody on the board yet this month. Be first.</p>
            ) : (
              <table className="htable">
                <thead>
                  <tr>
                    <th></th><th>Name</th><th></th>
                    <th style={{ textAlign: "right" }}>Hires</th>
                    <th style={{ textAlign: "right" }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.uid} className={r.you ? "you" : undefined}>
                      <td className={`hrk${r.rank === 1 ? " top" : ""}`}>{r.rank}</td>
                      <td>{r.you ? "You" : r.name}</td>
                      <td>
                        {r.points > 0 && (
                          <span className="hbar">
                            <i style={{ width: `${top ? Math.max(6, (r.points / top) * 100) : 6}%` }} />
                          </span>
                        )}
                      </td>
                      <td className="hnum">{r.hires}</td>
                      <td className="hnum">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <div className="hpanel">
              <h4>Do something</h4>
              <div className="hpad">
                <Link href="/submit" className="hcta">Submit a referral</Link>
                <div className="hquiet">
                  <Link href="/my-referrals">My referrals <span>{money ? `${open} open` : ""}</span></Link>
                  <Link href="/earnings">My earnings <span>{money ? `$${money.earned.toLocaleString()} paid` : ""}</span></Link>
                  <Link href="/prizes">Prizes &amp; goals <span>{board?.banner ? "1 running" : ""}</span></Link>
                  <Link href="/share">Share &amp; recruit <span>link + QR</span></Link>
                </div>
              </div>
            </div>
            {(profile?.role === "manager" || profile?.role === "admin" || profile?.v2Visible) && (
              <div className="hpanel" style={{ marginTop: 12 }}>
                <h4>Your tools</h4>
                <div className="hpad">
                  <div className="hquiet">
                    {(profile?.role === "manager" || profile?.role === "admin") && (
                      <Link href="/manage">Manage <span>funnel, people, scoring</span></Link>
                    )}
                    {profile?.v2Visible && (
                      <Link href="/recruiting">Recruiting <span>classes, candidates, reports</span></Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="note">
        Signed in as {profile?.email} · <button className="link" onClick={logout}>Sign out</button>
      </p>
    </Shell>
  );
}
