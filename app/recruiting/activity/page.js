"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import V2Guard from "@/components/V2Guard";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/firebaseClient";

function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// Plain sentences, not codes — this screen exists so nobody has to guess what
// happened or ask around.
function describe(r) {
  const d = r.details || {};
  const who = d.name ? `${d.name}` : r.target;
  switch (r.action) {
    case "v2.candidate.add":
      return `added ${who} to the ${d.role || ""} pipeline${
        d.firstInterview ? ` and booked a ${d.firstInterview.split(" · ")[0]} interview` : ""
      }${d.referrerName ? ` — referred by ${d.referrerName}` : ""}`;
    case "v2.candidate.stage":
      return `moved ${who} from ${d.from} to ${d.to}`;
    case "v2.candidate.hire":
      return `hired ${who}${d.startDate ? `, first day ${d.startDate}` : ""}`;
    case "v2.candidate.outcome":
      if (d.terminationDate) return `recorded ${who} leaving on ${d.terminationDate}`;
      if (d.started === false) return `marked ${who} as a no-show`;
      if (d.graduated === true) return `marked ${who} as graduated`;
      return `updated ${who}`;
    case "v2.candidate.setClass":
      return d.classId ? `moved ${who} to a different class` : `took ${who} out of their class`;
    case "v2.interview.schedule":
      return `scheduled a ${d.type} interview with ${who} for ${d.when} with ${d.interviewer}`;
    case "v2.interview.reschedule":
      return `moved ${who}'s interview — was ${d.was}, now ${d.now}`;
    case "v2.interview.close":
      return `marked ${who}'s ${d.type} interview on ${d.when} as ${d.outcome}`;
    case "v2.interview.score":
      return `scored ${who}'s ${d.type} interview${d.score != null ? ` — ${d.score}/10` : ""}${
        d.quals ? `, ${d.quals} quals met` : ""
      }`;
    case "v2.class.request":
      return `requested a ${d.role} class for ${d.date} at ${d.location}, ${d.target} seats`;
    case "v2.class.funnel":
      return `entered the applicant numbers for the ${d.role} class`;
    case "v2.class.costs":
      return `entered the costs for the ${d.role} class`;
    case "v2.scorecardForm.save":
      return `${d.status === "published" ? "published" : "saved a draft of"} the ${d.role} · ${
        d.ivType
      } scorecard`;
    case "v2.roles.update":
      return `changed the roles for ${r.target}`;
    case "v2.costFields.update":
      return "changed the cost categories";
    case "v2.reasons.update":
      return "changed the list of reasons people leave";
    case "v2.overhead.update":
      return `entered the monthly overhead for ${r.target}`;
    case "v2.referralWriteback":
      return `${who} was hired — their referral was advanced so ${
        d.referrerName || "the referrer"
      } gets paid`;
    default:
      return r.action.replace("v2.", "").replace(/\./g, " ");
  }
}

export default function Activity() {
  const { profile } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!profile?.v2Visible) return;
    api("/api/recruiting/activity")
      .then((d) => setRows(d.rows))
      .catch((e) => setErr(e.message));
  }, [profile]);

  return (
    <Shell wide nav={false}>
      <V2Guard>
        <h1>Activity</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Who changed what, newest first — so nobody has to ask whether a candidate has been called yet.
        </p>
        {err && <div className="toast warn">{err}</div>}
        {!rows && !err && <div className="spinner">Loading…</div>}
        {rows && !rows.length && <p className="rc-note">Nothing here yet.</p>}

        {rows?.length > 0 && (
          <div className="rc-tablewrap">
            {rows.map((r) => (
              <div key={r.id} className="rc-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span>
                  <b>{r.actorName}</b> {describe(r)}
                  {r.details?.dept ? <span className="tn"> · {r.details.dept}</span> : null}
                </span>
                <span className="tn">{relTime(r.at)}</span>
              </div>
            ))}
          </div>
        )}
      </V2Guard>
    </Shell>
  );
}
