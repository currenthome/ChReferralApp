"use client";

import Link from "next/link";
import Shell from "@/components/Shell";
import ManagerGuard from "@/components/ManagerGuard";

const TOOLS = [
  { href: "/manage/referrals", title: "Update referrals", sub: "Move candidates through the funnel.", primary: true },
  { href: "/manage/recruiting", title: "Recruiting queue", sub: "First-contact referrals waiting on a pre-screen." },
  { href: "/manage/pipeline", title: "Company pipeline", sub: "Every referral, all departments — monitor and nudge." },
  { href: "/manage/report", title: "Reporting", sub: "Funnel, conversions, hires, and rep performance." },
  { href: "/manage/people", title: "People", sub: "Add teammates, change access, activate or deactivate." },
  { href: "/manage/scoring", title: "Scoring & milestones", sub: "Points and cash for Submit, Start, and Day 30." },
  { href: "/manage/prizes", title: "Prizes & goals", sub: "Create races and targets for your team." },
  { href: "/manage/hires", title: "Hires & month-end", sub: "Terminations, milestone clocks, and the month freeze." },
];

export default function Manage() {
  return (
    <Shell>
      <ManagerGuard>
        <h1>Manage</h1>
        <p className="sub" style={{ marginBottom: 22 }}>Manager tools. Everyone with manager access can use these.</p>
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} style={{ textDecoration: "none", display: "block" }}>
            <div className={`action${t.primary ? " primary" : ""}`}>
              <span>
                <span className="at">{t.title}</span>
                <span className="as">{t.sub}</span>
              </span>
              <span className="chev">›</span>
            </div>
          </Link>
        ))}
      </ManagerGuard>
    </Shell>
  );
}
