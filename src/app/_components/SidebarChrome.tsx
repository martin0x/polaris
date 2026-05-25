"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";

// Collapsible sidebar chrome. The sidebar collapses to an icon-only rail; the
// state is shared between the title-bar toggle and the body grid, persisted to
// localStorage, and bound to ⌘\ (Ctrl+\). State lives here because TitleBar and
// the body grid sit in different branches of the server-rendered layout tree.

const STORAGE_KEY = "polaris.sidebar.collapsed";

// External store backing the collapsed flag. useSyncExternalStore lets the
// server render "expanded" and the client adopt the persisted value without a
// hydration mismatch, and keeps multiple tabs in sync via the storage event.
// `current` is the in-memory source of truth so the toggle still works when
// localStorage is unavailable (private mode).
let current: boolean | null = null;
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getSnapshot(): boolean {
  if (current === null) current = readStored();
  return current;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = readStored();
      onChange();
    }
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setCollapsed(next: boolean): void {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Ignore write failures; the in-memory value above still drives this tab.
  }
  listeners.forEach((notify) => notify());
}

type SidebarState = {
  collapsed: boolean;
  /** True once the grid transition is armed. Stays false through the initial
   *  restore from localStorage so the page settles without animating. */
  animate: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [animate, setAnimate] = useState(false);

  // Arm the transition one frame after the first paint, so restoring a
  // collapsed sidebar on load snaps into place instead of sliding.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = useCallback(() => setCollapsed(!getSnapshot()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <SidebarContext.Provider value={{ collapsed, animate, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}

// Wraps the two/three-column body grid and drives the collapsed state via class.
export function ShellBody({
  children,
  withRight = false,
}: {
  children: ReactNode;
  withRight?: boolean;
}) {
  const { collapsed, animate } = useSidebar();
  const className = [
    "body",
    withRight && "with-right",
    collapsed && "sidebar-collapsed",
    animate && "anim",
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={className}>{children}</div>;
}

// Title-bar button that toggles the sidebar.
export function SidebarToggle() {
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      type="button"
      className="titlebar-btn"
      onClick={toggle}
      aria-label={label}
      aria-pressed={collapsed}
      title={`${label} (⌘\\)`}
    >
      <Icon name="sidebar" size={14} />
    </button>
  );
}
