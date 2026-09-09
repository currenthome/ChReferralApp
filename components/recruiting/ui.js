"use client";

import { STAGE_LABEL } from "@/lib/recruiting";

export function initials(name) {
  return String(name || "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Dates are stored as plain "YYYY-MM-DD" with no timezone, so parse them at
// midday to keep them from sliding a day either side of the date line.
export function fmtDate(ymd) {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T12:00:00`);
  return {
    day: d.getDate(),
    mon: d.toLocaleString("en", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString("en", { weekday: "long" }),
    full: d.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" }),
  };
}

export function fmtDT(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
  );
}

export function StageBadge({ stage }) {
  return <span className={`rc-stage s-${stage}`}>{STAGE_LABEL[stage] || stage}</span>;
}

export function Modal({ title, children, footer, onClose }) {
  return (
    <div className="rc-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rc-box">
        <div className="rc-mh">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="rc-mb">{children}</div>
        {footer && <div className="rc-mf">{footer}</div>}
      </div>
    </div>
  );
}
