"use client";

import { useState } from "react";
import Link from "next/link";
import type { HabitDetail } from "../services/detail";
import type { HabitDto } from "../services/ticks";
import { addDays, formatDayShort, localDayOf, localTodayString, mondayOf } from "../lib/dates";

interface RowDropdownProps {
  habit: HabitDto;
  dates: string[];
  detail: HabitDetail | null;
  onSaveQuote: (quote: string) => void;
  onRecreateTopic: () => void;
  onOpenLog: (date: string, trigger: HTMLElement) => void;
}

export function RowDropdown({
  habit, dates, detail, onSaveQuote, onRecreateTopic, onOpenLog,
}: RowDropdownProps) {
  if (!detail) {
    return (
      <div className="habit-dropdown">
        <p className="caption">Loading…</p>
      </div>
    );
  }

  const topicHref = `/journal/topics/${encodeURIComponent(detail.topicName)}`;
  const byDay = new Map<string, HabitDetail["entries"]>();
  for (const e of detail.entries) {
    const day = localDayOf(e.createdAt);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const today = localTodayString();

  return (
    <div className="habit-dropdown">
      {detail.topicState === "ok" && (
        <div className="habit-diamonds" aria-label="Journal logs this week">
          <span />
          {dates.map((d) => {
            const logs = byDay.get(d) ?? [];
            if (d > today) return <span key={d} className="habit-diamond-cell" />;
            const label = logs.length
              ? `${logs[0].title ?? logs[0].excerpt}${logs.length > 1 ? ` +${logs.length - 1} more` : ""}`
              : `Log ${habit.name} — ${formatDayShort(d)}`;
            return (
              <span key={d} className="habit-diamond-cell">
                <button
                  type="button"
                  className="habit-diamond"
                  title={label}
                  aria-label={label}
                  onClick={(e) => onOpenLog(d, e.currentTarget)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path
                      d="M7 1.5 12.5 7 7 12.5 1.5 7Z"
                      className={logs.length ? "habit-diamond-fill" : "habit-diamond-outline"}
                    />
                  </svg>
                </button>
              </span>
            );
          })}
          <span />
        </div>
      )}
      {detail.topicState === "archived" && (
        <p className="habit-topic-note">
          Journal topic is archived — <Link href={topicHref}>unarchive it</Link> to keep logging.
        </p>
      )}
      {detail.topicState === "missing" && (
        <p className="habit-topic-note">
          Journal topic is missing.
          <button type="button" className="btn btn-ghost" onClick={onRecreateTopic}>
            Recreate topic
          </button>
        </p>
      )}
      <div className="habit-dropdown-cols">
        <QuoteBox quote={habit.quote} onSave={onSaveQuote} />
        <MiniCalendar last30={detail.last30} createdOn={habit.createdOn} />
        <section className="habit-summary">
          <span className="overline">Summary</span>
          <p>No summary yet.</p>
          <p className="caption">Summaries will read your journal logs in a coming increment.</p>
        </section>
      </div>
    </div>
  );
}

function QuoteBox({ quote, onSave }: { quote: string | null; onSave: (q: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quote ?? "");

  if (editing) {
    return (
      <section className="habit-quote">
        <span className="overline">Quote</span>
        <textarea
          className="habit-quote-input"
          value={draft}
          autoFocus
          rows={4}
          aria-label="Quote, goal, or tip"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(draft.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              setEditing(false);
              onSave(draft.trim());
            }
            if (e.key === "Escape") {
              setDraft(quote ?? "");
              setEditing(false);
            }
          }}
        />
      </section>
    );
  }
  return (
    <section className="habit-quote">
      <span className="overline">Quote</span>
      <button
        type="button"
        className="habit-quote-view"
        onClick={() => {
          setDraft(quote ?? "");
          setEditing(true);
        }}
      >
        {quote ? <blockquote>{quote}</blockquote> : <p className="caption">Add a quote, goal, or tip.</p>}
      </button>
    </section>
  );
}

function MiniCalendar({ last30, createdOn }: { last30: HabitDetail["last30"]; createdOn: string }) {
  const today = localTodayString();
  const start = addDays(today, -29);
  const gridStart = mondayOf(start);
  const byDate = new Map(last30.map((t) => [t.date, t.status]));
  const cells: string[] = [];
  for (let d = gridStart; d <= today; d = addDays(d, 1)) cells.push(d);

  return (
    <section className="habit-minical">
      <span className="overline">Past 30 days</span>
      <div className="habit-minical-grid">
        {cells.map((d) => {
          const inWindow = d >= start && d >= createdOn;
          const status = byDate.get(d);
          const cls = !inWindow
            ? "is-blank"
            : status === "COMPLETE"
              ? "is-complete"
              : status === "PARTIAL"
                ? "is-partial"
                : "is-missed";
          return <span key={d} className={`habit-minical-dot ${cls}`} title={d} />;
        })}
      </div>
    </section>
  );
}
