"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/Icon";
import { addDays, formatWeekRange, localTodayString, mondayOf, toUtcDate } from "../lib/dates";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface WeekHeaderProps {
  monday: string;
  onNavigate: (dateStr: string) => void;
}

export function WeekHeader({ monday, onNavigate }: WeekHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="habit-head">
      <button
        type="button" className="btn btn-ghost habit-nav" aria-label="Previous week"
        onClick={() => onNavigate(addDays(monday, -7))}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      <span className="habit-range-wrap">
        <button
          type="button" className="habit-range" aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {formatWeekRange(monday)}
        </button>
        {open && (
          <MonthPopover
            anchor={monday}
            onPick={(d) => { setOpen(false); onNavigate(d); }}
            onClose={() => setOpen(false)}
          />
        )}
      </span>
      <button
        type="button" className="btn btn-ghost habit-nav" aria-label="Next week"
        onClick={() => onNavigate(addDays(monday, 7))}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </header>
  );
}

function MonthPopover({
  anchor, onPick, onClose,
}: {
  anchor: string;
  onPick: (dateStr: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState(`${anchor.slice(0, 7)}-01`);
  const today = localTodayString();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const d = toUtcDate(first);
  const title = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const gridStart = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = first.slice(0, 7);

  const shiftMonth = (n: number) => {
    const next = new Date(toUtcDate(first));
    next.setUTCMonth(next.getUTCMonth() + n);
    setFirst(next.toISOString().slice(0, 8) + "01");
  };

  return (
    <div className="habit-popover" ref={ref} role="dialog" aria-label="Jump to week">
      <div className="habit-popover-head">
        <button type="button" className="btn btn-ghost habit-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <Icon name="chevron-left" size={14} />
        </button>
        <span className="habit-popover-title">{title}</span>
        <button type="button" className="btn btn-ghost habit-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="habit-popover-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((c, i) => (
          <span key={`h${i}`} className="habit-popover-dow">{c}</span>
        ))}
        {cells.map((c) => (
          <button
            key={c}
            type="button"
            className={
              "habit-popover-day" +
              (c.slice(0, 7) === month ? "" : " is-outside") +
              (c === today ? " is-today" : "")
            }
            onClick={() => onPick(c)}
          >
            {Number(c.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}
