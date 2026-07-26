"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { WeekData } from "../services/ticks";
import type { HabitDetail } from "../services/detail";
import { addDays, localTodayString, mondayOf, weekDates } from "../lib/dates";
import { initSounds, playSound } from "../lib/sounds";
import { Icon } from "@/app/_components/Icon";
import { TickCircle, type TickState } from "./TickCircle";
import { WeekHeader } from "./WeekHeader";
import { AddHabitForm } from "./AddHabitForm";
import { RowMenu } from "./RowMenu";
import { ArchivedDisclosure } from "./ArchivedDisclosure";
import { RowDropdown } from "./RowDropdown";

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
  const detailSeq = useRef<Map<string, number>>(new Map());
  const navSeq = useRef(0);
  const [week, setWeek] = useState<WeekData>(initialWeek);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, HabitDetail>>({});

  const fetchWeek = useCallback(async (monday: string): Promise<WeekData | null> => {
    const cached = cache.current.get(monday);
    if (cached) return cached;
    try {
      const res = await fetch(`/api/systems/habits/week?start=${monday}`);
      if (!res.ok) return null;
      const data: WeekData = await res.json();
      cache.current.set(monday, data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const goToWeek = useCallback(async (target: string) => {
    const monday = mondayOf(target);
    const seq = ++navSeq.current;
    const data = await fetchWeek(monday);
    if (navSeq.current !== seq) return; // superseded by a newer navigation
    if (!data) {
      setError("Could not load that week. Check your connection.");
      return;
    }
    setError(null);
    setWeek(data);
    void fetchWeek(addDays(monday, -7));
    void fetchWeek(addDays(monday, 7));
  }, [fetchWeek]);

  const searchParams = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);

  const errorOf = async (res: Response | null, fallback: string): Promise<string> => {
    if (!res) return `${fallback} Check your connection.`;
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : fallback;
  };

  const refresh = useCallback(async () => {
    cache.current.clear();
    const seq = ++navSeq.current;
    try {
      const res = await fetch(`/api/systems/habits/week?start=${week.monday}`);
      if (navSeq.current !== seq) return; // superseded by a newer navigation
      if (!res.ok) throw new Error(String(res.status));
      const data: WeekData = await res.json();
      cache.current.set(data.monday, data);
      setWeek(data);
      setDetails({});
    } catch {
      if (navSeq.current !== seq) return;
      setError("Could not refresh — reload the page.");
    }
  }, [week.monday]);

  const addHabit = async (name: string, quote: string): Promise<boolean> => {
    const res = await fetch("/api/systems/habits/habits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quote ? { name, quote } : { name }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, "Could not add the habit."));
      return false;
    }
    setError(null);
    await refresh();
    return true;
  };

  const saveRename = async (id: string, rawName: string) => {
    setEditingId(null);
    const habit = week.habits.find((h) => h.id === id);
    const name = rawName.trim();
    if (!habit || !name || name === habit.name) return;
    const res = await fetch(`/api/systems/habits/habits/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, "Could not rename the habit."));
      return;
    }
    setError(null);
    await refresh();
  };

  const moveHabit = async (id: string, dir: -1 | 1) => {
    const idx = week.habits.findIndex((h) => h.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= week.habits.length) return;
    const ids = week.habits.map((h) => h.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    setWeek((w) => {
      const habits = [...w.habits];
      const [moved] = habits.splice(idx, 1);
      habits.splice(target, 0, moved);
      const next = { ...w, habits };
      cache.current.set(w.monday, next);
      return next;
    });
    const res = await fetch("/api/systems/habits/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Could not save the order — reloading.");
      await refresh();
    }
  };

  const setArchived = async (id: string, archive: boolean) => {
    const res = await fetch(
      `/api/systems/habits/habits/${id}/${archive ? "archive" : "unarchive"}`,
      { method: "POST" }
    ).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, archive ? "Could not archive the habit." : "Could not unarchive the habit."));
      return;
    }
    setError(null);
    await refresh();
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const detailKey = (habitId: string) => `${habitId}|${week.monday}`;

  const prefetchDetail = async (habitId: string, opts?: { force?: boolean }) => {
    const key = detailKey(habitId);
    if (!opts?.force && details[key]) return;
    const seq = (detailSeq.current.get(key) ?? 0) + 1;
    detailSeq.current.set(key, seq);
    try {
      const res = await fetch(`/api/systems/habits/habits/${habitId}/detail?week=${week.monday}`);
      if (!res.ok) return;
      const data: HabitDetail = await res.json();
      if (detailSeq.current.get(key) !== seq) return; // superseded by a newer fetch
      setDetails((d) => ({ ...d, [key]: data }));
    } catch {
      // detail loads lazily; the stale copy (or loading state) stays until a retry
    }
  };

  const saveQuote = async (habitId: string, quote: string) => {
    const res = await fetch(`/api/systems/habits/habits/${habitId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Could not save the quote.");
      return;
    }
    setError(null);
    setWeek((w) => {
      const habits = w.habits.map((h) => (h.id === habitId ? { ...h, quote: quote || null } : h));
      const next = { ...w, habits };
      cache.current.set(w.monday, next);
      return next;
    });
  };

  const recreateTopic = async (habitId: string) => {
    const res = await fetch(`/api/systems/habits/habits/${habitId}/recreate-topic`, {
      method: "POST",
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Could not recreate the topic.");
      return;
    }
    setError(null);
    setDetails({});
    await refresh();
  };

  useEffect(() => {
    void fetchWeek(addDays(initialWeek.monday, -7));
    void fetchWeek(addDays(initialWeek.monday, 7));
  }, [fetchWeek, initialWeek.monday]);

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
    setDetails((d) => {
      const keep = expandedId === habitId ? detailKey(habitId) : null;
      const next = { ...d };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${habitId}|`) && k !== keep) delete next[k];
      }
      return next;
    });
    if (expandedId === habitId) void prefetchDetail(habitId, { force: true });
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
    <>
      <section className="paper-card habit-card" onPointerDownCapture={initSounds}>
        <WeekHeader monday={week.monday} onNavigate={goToWeek} />
        <div className="habit-grid" role="table" aria-label="Habit tracker">
          <div className="habit-grid-row habit-grid-head" role="row">
            <span className="habit-name" />
            {dates.map((d, i) => (
              <span key={d} className={`habit-day${d === today ? " is-today" : ""}`}>
                <span>{DAY_INITIALS[i]}</span>
                <span className="habit-day-num">{Number(d.slice(8))}</span>
              </span>
            ))}
            <span />
          </div>
          {week.habits.map((h) => (
            <div
              key={h.id}
              className="habit-row-wrap"
              onPointerEnter={() => void prefetchDetail(h.id)}
            >
              <div className="habit-grid-row" role="row">
                <span className="habit-name">
                  <button
                    type="button"
                    className={`habit-expand${expandedId === h.id ? " is-open" : ""}`}
                    aria-expanded={expandedId === h.id}
                    aria-label={`Details for ${h.name}`}
                    onClick={() => {
                      void prefetchDetail(h.id);
                      setExpandedId(expandedId === h.id ? null : h.id);
                    }}
                  >
                    <Icon name="chevron-right" size={14} />
                  </button>
                  {editingId === h.id ? (
                    <input
                      className="habit-rename-input"
                      defaultValue={h.name}
                      autoFocus
                      aria-label={`Rename ${h.name}`}
                      onBlur={(e) => void saveRename(h.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(h.id, e.currentTarget.value);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <span className="habit-name-text">{h.name}</span>
                  )}
                </span>
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
                <span className="habit-menu-cell">
                  <RowMenu
                    canMoveUp={week.habits[0]?.id !== h.id}
                    canMoveDown={week.habits[week.habits.length - 1]?.id !== h.id}
                    onRename={() => setEditingId(h.id)}
                    onMoveUp={() => void moveHabit(h.id, -1)}
                    onMoveDown={() => void moveHabit(h.id, 1)}
                    onArchive={() => void setArchived(h.id, true)}
                  />
                </span>
              </div>
              {expandedId === h.id && (
                <RowDropdown
                  habit={h}
                  dates={dates}
                  detail={details[detailKey(h.id)] ?? null}
                  onSaveQuote={(q) => void saveQuote(h.id, q)}
                  onRecreateTopic={() => void recreateTopic(h.id)}
                />
              )}
            </div>
          ))}
        </div>
        {week.habits.length === 0 && (
          <div className="habit-empty">
            <p>No habits yet.</p>
            <p className="caption">Add one below to start tracking.</p>
          </div>
        )}
        <AddHabitForm startOpen={searchParams.get("new") === "1"} onAdd={addHabit} />
        {error && <p className="habit-error">{error}</p>}
      </section>
      <ArchivedDisclosure
        archived={week.archivedHabits}
        onUnarchive={(id) => void setArchived(id, false)}
      />
    </>
  );
}
