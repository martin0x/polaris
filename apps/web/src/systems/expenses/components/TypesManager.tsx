"use client";

import { useState } from "react";
import { usePreloadedQuery, useMutation, type Preloaded } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { Icon } from "@/app/_components/Icon";

export function TypesManager({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.expenses.types.list>;
}) {
  const types = usePreloadedQuery(preloaded);
  const createType = useMutation(api.expenses.types.create);
  const updateType = useMutation(api.expenses.types.update);
  const swapTypes = useMutation(api.expenses.types.swap);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<Id<"expenseActivityTypes"> | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);

  // Replaces the REST call() helper: same error-copy contract, no refresh —
  // the query is reactive.
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : "The change did not save. Try again."
      );
      return false;
    }
  }

  async function addType() {
    if (!newName.trim()) return;
    if (await run(() => createType({ name: newName.trim() }))) setNewName("");
  }

  async function rename(id: Id<"expenseActivityTypes">) {
    if (!editName.trim()) return;
    if (await run(() => updateType({ id, name: editName.trim() }))) setEditingId(null);
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= active.length) return;
    await run(() => swapTypes({ first: active[index].id, second: active[other].id }));
  }

  return (
    <div>
      {error ? (
        <p className="caption" style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {active.map((t, i) => (
          <div key={t.id} className="exp-row">
            {editingId === t.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  aria-label="Type name"
                  autoFocus
                  style={{ flex: 1, minWidth: 0, padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit" }}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void rename(t.id);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => rename(t.id)}>
                  Save
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>{t.name}</span>
                <button type="button" className="btn btn-ghost" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                </button>
                <button type="button" className="btn btn-ghost" aria-label={`Move ${t.name} down`} disabled={i === active.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingId(t.id);
                    setEditName(t.name);
                  }}
                >
                  Rename
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => run(() => updateType({ id: t.id, archived: true }))}>
                  Archive
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form
        style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void addType();
        }}
      >
        <input
          type="text"
          value={newName}
          placeholder="New type"
          aria-label="New type name"
          style={{ flex: 1, minWidth: 0, padding: "var(--sp-2) var(--sp-3)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit" }}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Add type
        </button>
      </form>

      {archived.length > 0 ? (
        <details style={{ marginTop: "var(--sp-6)" }}>
          <summary className="overline" style={{ cursor: "pointer" }}>
            Archived
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: "var(--sp-2)" }}>
            {archived.map((t) => (
              <div key={t.id} className="exp-row">
                <span style={{ flex: 1, color: "var(--fg-muted)" }}>{t.name}</span>
                <button type="button" className="btn btn-ghost" onClick={() => run(() => updateType({ id: t.id, archived: false }))}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
