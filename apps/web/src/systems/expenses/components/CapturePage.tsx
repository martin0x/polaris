"use client";

import { useRef, useState } from "react";
import { usePreloadedQuery, useMutation, type Preloaded } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import { formatCentavos } from "@polaris/core/money";
import { useSyncStatus } from "@/app/_components/SyncStatus";
import { ItemComposer } from "./ItemComposer";
import { ItemRow, type CaptureItem } from "./ItemRow";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function CapturePage({
  preloaded,
  urlId,
}: {
  preloaded: Preloaded<typeof api.expenses.activities.get>;
  urlId: string;
}) {
  const activity = usePreloadedQuery(preloaded);
  const [editingTitle, setEditingTitle] = useState(false);
  const { track } = useSyncStatus();
  const listEndRef = useRef<HTMLDivElement>(null);

  const getArgs = { id: urlId }; // subscription key — optimistic updates must match it

  const putItem = useMutation(api.expenses.items.put).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.expenses.activities.get, getArgs);
    if (!current) return;
    const items = current.items.filter((i) => i.clientId !== args.clientId);
    items.push({
      clientId: args.clientId,
      name: args.name,
      amountCentavos: args.amountCentavos,
      position: args.position,
    });
    items.sort((a, b) => a.position - b.position);
    store.setQuery(api.expenses.activities.get, getArgs, { ...current, items });
  });

  const removeItem = useMutation(api.expenses.items.remove).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.expenses.activities.get, getArgs);
    if (!current) return;
    store.setQuery(api.expenses.activities.get, getArgs, {
      ...current,
      items: current.items.filter((i) => i.clientId !== args.clientId),
    });
  });

  const updateActivity = useMutation(api.expenses.activities.update).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.expenses.activities.get, getArgs);
      if (!current || args.title === undefined) return;
      store.setQuery(api.expenses.activities.get, getArgs, { ...current, title: args.title });
    }
  );

  if (activity === null) return null; // deleted mid-session; RSC 404s on load

  const items = activity.items; // already position-sorted by the query
  const total = items.reduce((sum, i) => sum + i.amountCentavos, 0);
  // TS doesn't carry the `activity !== null` narrowing into nested function
  // declarations below, so capture the fields they need as plain consts.
  const activityId = activity.id;
  const activityTitle = activity.title;

  function addItem(name: string, amountCentavos: number) {
    const clientId = crypto.randomUUID();
    const position = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    track(putItem({ activityId, clientId, name, amountCentavos, position }),
      `${name} — ${formatCentavos(amountCentavos)}`);
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: "nearest" }));
  }

  function editItem(id: string, name: string, amountCentavos: number) {
    const existing = items.find((i) => i.clientId === id);
    if (!existing) return;
    track(
      putItem({
        activityId,
        clientId: id,
        name,
        amountCentavos,
        position: existing.position,
      }),
      `${name} — ${formatCentavos(amountCentavos)}`
    );
  }

  function deleteItem(id: string) {
    const target = items.find((i) => i.clientId === id);
    track(removeItem({ activityId, clientId: id }),
      `Delete ${target?.name ?? "item"}`);
  }

  async function saveTitle(raw: string) {
    setEditingTitle(false);
    const next = raw.trim() || null;
    if (next === activityTitle) return;
    track(updateActivity({ id: activityId, title: next }), "Activity title");
  }

  return (
    <article className="doc" style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
      <header className="exp-header">
        <div style={{ minWidth: 0 }}>
          {editingTitle ? (
            <input
              type="text"
              defaultValue={activity.title ?? ""}
              autoFocus
              aria-label="Activity title"
              style={{ width: "100%", padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit", fontSize: "var(--fs-lg)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveTitle(e.currentTarget.value);
                } else if (e.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
              onBlur={(e) => void saveTitle(e.target.value)}
            />
          ) : (
            <h1 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>
              <button
                type="button"
                aria-label="Edit title"
                style={{ border: "none", background: "none", font: "inherit", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer" }}
                onClick={() => setEditingTitle(true)}
              >
                {activity.title ?? activity.typeName}
              </button>
            </h1>
          )}
          <p className="caption" style={{ margin: 0, color: "var(--fg-muted)" }}>
            {activity.title ? `${activity.typeName} · ` : ""}
            {DATE_FORMAT.format(new Date(activity.startedAt))}
            {items.length > 0 ? ` · ${items.length} ${items.length === 1 ? "item" : "items"}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <span className="exp-total">{formatCentavos(total)}</span>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, paddingTop: "var(--sp-3)" }}>
        {items.length === 0 ? (
          <p className="lead">No items yet. Type the first one below.</p>
        ) : (
          items.map((item) => (
            <ItemRow
              key={item.clientId}
              item={
                {
                  id: item.clientId,
                  name: item.name,
                  amountCentavos: item.amountCentavos,
                  position: item.position,
                } satisfies CaptureItem
              }
              onEdit={editItem}
              onDelete={deleteItem}
            />
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <ItemComposer onAdd={addItem} />
    </article>
  );
}
