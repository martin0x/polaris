"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCentavos } from "../lib/money";
import { SyncQueue, type QueueOp } from "../lib/syncQueue";
import { ItemComposer } from "./ItemComposer";
import { ItemRow, type CaptureItem } from "./ItemRow";

interface CapturePageProps {
  activity: { id: string; title: string | null; typeName: string; startedAt: string };
  initialItems: CaptureItem[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Replay pending queue ops on top of the server snapshot so optimistic state
 *  survives a refresh inside a dead zone. Pure — the queue owns the storage. */
function applyQueuedOps(items: CaptureItem[], ops: QueueOp[]): CaptureItem[] {
  let next = [...items];
  for (const op of ops) {
    if (op.kind === "delete") {
      next = next.filter((i) => i.id !== op.itemId);
    } else if (op.body) {
      const existing = next.findIndex((i) => i.id === op.itemId);
      const restored = { id: op.itemId, ...op.body };
      if (existing >= 0) next[existing] = restored;
      else next.push(restored);
    }
  }
  return next.sort((a, b) => a.position - b.position);
}

export function CapturePage({ activity, initialItems }: CapturePageProps) {
  const [items, setItems] = useState<CaptureItem[]>(initialItems);
  const [pending, setPending] = useState(0);
  const [failing, setFailing] = useState(false);
  const queueRef = useRef<SyncQueue | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const queue = new SyncQueue({
      activityId: activity.id,
      onChange: (count, isFailing) => {
        setPending(count);
        setFailing(isFailing);
      },
    });
    queueRef.current = queue;

    const restored = queue.pendingOps();
    if (restored.length > 0) {
      // localStorage is only available on the client; merging during render
      // would cause a hydration mismatch (see ComposeBox for the precedent).
      // Runs at most once on mount, so this is not a cascading-render situation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems((current) => applyQueuedOps(current, restored));
    }
    queue.flush();

    const flush = () => queue.flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", flush);
      queue.dispose();
    };
  }, [activity.id]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.amountCentavos, 0),
    [items]
  );

  function addItem(name: string, amountCentavos: number) {
    const id = crypto.randomUUID();
    const position = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const item = { id, name, amountCentavos, position };
    setItems((prev) => [...prev, item]);
    queueRef.current?.enqueue({ kind: "put", itemId: id, body: { name, amountCentavos, position } });
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: "nearest" }));
  }

  function editItem(id: string, name: string, amountCentavos: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name, amountCentavos } : i)));
    queueRef.current?.enqueue({
      kind: "put",
      itemId: id,
      body: { name, amountCentavos, position: item.position },
    });
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    queueRef.current?.enqueue({ kind: "delete", itemId: id });
  }

  return (
    <article className="doc" style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
      <header className="exp-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>
            {activity.title ?? activity.typeName}
          </h1>
          <p className="caption" style={{ margin: 0, color: "var(--fg-muted)" }}>
            {activity.title ? `${activity.typeName} · ` : ""}
            {DATE_FORMAT.format(new Date(activity.startedAt))}
            {items.length > 0 ? ` · ${items.length} ${items.length === 1 ? "item" : "items"}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {pending > 0 ? (
            <span className="exp-unsynced">
              {failing ? "Could not sync — retrying" : `${pending} unsynced`}
            </span>
          ) : null}
          <span className="exp-total">{formatCentavos(total)}</span>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, paddingTop: "var(--sp-3)" }}>
        {items.length === 0 ? (
          <p className="lead">No items yet. Type the first one below.</p>
        ) : (
          items.map((item) => (
            <ItemRow key={item.id} item={item} onEdit={editItem} onDelete={deleteItem} />
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <ItemComposer onAdd={addItem} />
    </article>
  );
}
