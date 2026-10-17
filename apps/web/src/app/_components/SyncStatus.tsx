"use client";

// Global sync registry: mutations register in-flight work here and the
// TitleBar indicator renders it. State lives here because the TitleBar and
// the page content sit in different branches of the server-rendered layout
// tree (same shape as SidebarChrome).

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface PendingOp {
  id: number;
  label: string;
}

interface SyncStatusValue {
  pending: PendingOp[];
  track: (promise: Promise<unknown>, label: string) => void;
}

const Ctx = createContext<SyncStatusValue | null>(null);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingOp[]>([]);
  const nextId = useRef(0);

  const track = useCallback((promise: Promise<unknown>, label: string) => {
    const id = nextId.current++;
    setPending((ops) => [...ops, { id, label }]);
    promise
      // A rejected mutation rolls its optimistic write back on its own.
      .catch((err) => console.error("sync: change rejected", err))
      .finally(() => setPending((ops) => ops.filter((op) => op.id !== id)));
  }, []);

  const value = useMemo(() => ({ pending, track }), [pending, track]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSyncStatus(): SyncStatusValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSyncStatus must be used within SyncStatusProvider");
  return ctx;
}

/** Like useSyncStatus, but null outside a provider (e.g. signed-out chrome). */
export function useSyncStatusOptional(): SyncStatusValue | null {
  return useContext(Ctx);
}
