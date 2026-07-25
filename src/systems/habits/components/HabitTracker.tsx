"use client";

import { useRef, useState } from "react";
import type { WeekData } from "../services/ticks";
import { formatWeekRange, localTodayString, weekDates } from "../lib/dates";
import { initSounds, playSound } from "../lib/sounds";
import { TickCircle, type TickState } from "./TickCircle";

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

function tickKey(habitId: string, date: string): string {
  return `${habitId}|${date}`;
}

function stateOf(status: "PARTIAL" | "COMPLETE" | undefined): TickState {
  if (status === "COMPLETE") return "complete";
  if (status === "PARTIAL") return "partial";
  return "off";
}

export function HabitTracker({ initialWeek }: { initialWeek: WeekData }) {
  const cache = useRef<Map<string, WeekData>>(new Map([[initialWeek.monday, initialWeek]]));
  const tickSeq = useRef<Map<string, number>>(new Map());
  const [week, setWeek] = useState<WeekData>(initialWeek);
  const [error, setError] = useState<string | null>(null);
  const today = localTodayString();
  const dates = weekDates(week.monday);
  const ticks = new Map(week.ticks.map((t) => [tickKey(t.habitId, t.date), t.status]));

  const mutateTick = (habitId: string, date: string, state: TickState) => {
    setWeek((w) => {
      const others = w.ticks.filter((t) => !(t.habitId === habitId && t.date === date));
      const next = {
        ...w,
        ticks:
          state === "off"
            ? others
            : [...others, {
                habitId, date,
                status: state === "partial" ? ("PARTIAL" as const) : ("COMPLETE" as const),
              }],
      };
      cache.current.set(w.monday, next);
      return next;
    });
  };

  const handleTick = (habitId: string, date: string, next: TickState) => {
    const prev = stateOf(ticks.get(tickKey(habitId, date)));
    if (prev === next) return;
    const key = tickKey(habitId, date);
    const seq = (tickSeq.current.get(key) ?? 0) + 1;
    tickSeq.current.set(key, seq);
    playSound(next);
    mutateTick(habitId, date, next);
    setError(null);
    const url = `/api/systems/habits/habits/${habitId}/ticks/${date}`;
    const request =
      next === "off"
        ? fetch(url, { method: "DELETE" })
        : fetch(url, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: next === "partial" ? "PARTIAL" : "COMPLETE" }),
          });
    request
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
      })
      .catch(() => {
        if (tickSeq.current.get(key) !== seq) return; // superseded by a newer toggle
        mutateTick(habitId, date, prev);
        setError("Could not save that tick — reverted. Check your connection.");
      });
  };

  return (
    <section className="paper-card habit-card" onPointerDownCapture={initSounds}>
      <header className="habit-head">
        <span className="habit-range">{formatWeekRange(week.monday)}</span>
      </header>
      <div className="habit-grid" role="table" aria-label="Habit tracker">
        <div className="habit-grid-row habit-grid-head" role="row">
          <span className="habit-name" />
          {dates.map((d, i) => (
            <span key={d} className={`habit-day${d === today ? " is-today" : ""}`}>
              {DAY_INITIALS[i]}
            </span>
          ))}
        </div>
        {week.habits.map((h) => (
          <div key={h.id} className="habit-grid-row" role="row">
            <span className="habit-name">{h.name}</span>
            {dates.map((d) => (
              <span key={d} className={`habit-cell${d === today ? " is-today" : ""}`}>
                <TickCircle
                  state={stateOf(ticks.get(tickKey(h.id, d)))}
                  disabled={d > today}
                  label={`${h.name} — ${d}`}
                  onChange={(next) => handleTick(h.id, d, next)}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
      {week.habits.length === 0 && (
        <div className="habit-empty">
          <p>No habits yet.</p>
          <p className="caption">Add one below to start tracking.</p>
        </div>
      )}
      {error && <p className="habit-error">{error}</p>}
    </section>
  );
}
