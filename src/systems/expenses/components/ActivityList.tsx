"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/app/_components/Icon";
import { formatCentavos } from "../lib/money";

export interface ActivityRow {
  id: string;
  typeName: string;
  title: string | null;
  startedAt: string; // ISO
  itemCount: number;
  totalCentavos: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function ActivityList({ activities }: { activities: ActivityRow[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this activity and all its items?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/systems/expenses/activities/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  if (activities.length === 0) {
    return (
      <p className="lead">
        No activities yet. Tap a type above to start one.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: "var(--sp-4)" }}>
      {activities.map((a) => (
        <div key={a.id} className="exp-row">
          <Link
            href={`/expenses/${a.id}`}
            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "var(--sp-3)", color: "inherit", textDecoration: "none" }}
          >
            <span style={{ fontWeight: 500 }}>{a.title ?? a.typeName}</span>
            <span className="caption" style={{ color: "var(--fg-muted)" }}>
              {a.title ? `${a.typeName} · ` : ""}
              {DATE_FORMAT.format(new Date(a.startedAt))} · {a.itemCount}{" "}
              {a.itemCount === 1 ? "item" : "items"}
            </span>
          </Link>
          <span className="amount">{formatCentavos(a.totalCentavos)}</span>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={`Delete ${a.title ?? a.typeName}`}
            disabled={deletingId === a.id}
            onClick={() => remove(a.id)}
          >
            <Icon name="trash-2" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
