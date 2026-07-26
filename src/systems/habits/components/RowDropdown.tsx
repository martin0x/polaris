"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/Icon";
import type { HabitDetail } from "../services/detail";
import type { HabitDto } from "../services/ticks";
import { addDays, localTodayString, mondayOf } from "../lib/dates";

/** Group an ISO timestamp into the browser's local calendar day. */
function localDayOf(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface RowDropdownProps {
  habit: HabitDto;
  dates: string[];
  detail: HabitDetail | null;
  onSaveQuote: (quote: string) => void;
  onRecreateTopic: () => void;
}

export function RowDropdown({ habit, dates, detail, onSaveQuote, onRecreateTopic }: RowDropdownProps) {
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

  return (
    <div className="habit-dropdown">
      {detail.topicState === "ok" && (
        <div className="habit-diamonds" aria-label="Journal logs this week">
          <span />
          {dates.map((d) => (
            <span key={d} className="habit-diamond-cell">
              {(byDay.get(d) ?? []).map((e) => (
                <Link
                  key={e.id}
                  href={`${topicHref}#entry-${e.id}`}
                  className="habit-diamond"
                  title={e.title ?? e.excerpt}
                  aria-label={`Open log: ${e.title ?? e.excerpt}`}
                >
                  <Icon name="diamond" size={14} />
                </Link>
              ))}
            </span>
          ))}
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
