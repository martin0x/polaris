"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { useSidebar } from "./SidebarChrome";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  badge?: string;
};

// Left-nav organizes by SYSTEM, not by file/folder. Each system is a self-contained
// source-code module; the sidebar is the index of them.
export function Sidebar({
  systems,
  footer,
}: {
  systems: NavItem[];
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  // In the rail, labels are hidden — expose them as accessible name + tooltip.
  const railName = (label: string) => (collapsed ? label : undefined);

  return (
    <aside className="sidebar">
      <button
        className="sb-search"
        type="button"
        aria-label="Search or jump to"
        title={collapsed ? "Search or jump to (⌘K)" : undefined}
      >
        <Icon name="search" size={14} />
        <span className="sb-label">Search or jump to…</span>
        <span className="k">⌘K</span>
      </button>

      <Link
        href="/dashboard"
        className={`sb-item${isActive("/dashboard") ? " active" : ""}`}
        aria-label={railName("Today")}
        title={railName("Today")}
      >
        <Icon name="compass" size={14} />
        <span className="sb-label">Today</span>
      </Link>

      <div className="sb-sec">
        <span>Systems</span>
        <span className="add" title="Add a system">
          <Icon name="plus" size={12} />
        </span>
      </div>
      {systems.length === 0 ? (
        <div
          style={{
            padding: "6px 8px",
            fontSize: 12,
            color: "var(--ink-4)",
            fontStyle: "italic",
          }}
        >
          No systems yet.
        </div>
      ) : (
        systems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-item${isActive(item.href) ? " active" : ""}`}
            aria-label={railName(item.label)}
            title={railName(item.label)}
          >
            <Icon name={item.icon} size={14} />
            <span className="sb-label">{item.label}</span>
            {item.badge && (
              <span
                className="count"
                style={{ color: "var(--accent-ink)" }}
              >
                {item.badge}
              </span>
            )}
            {item.count != null && (
              <span className="count">{item.count}</span>
            )}
          </Link>
        ))
      )}

      <div style={{ flex: 1 }} />

      <div className="sb-sec">System</div>
      <Link
        href="/settings"
        className={`sb-item${isActive("/settings") ? " active" : ""}`}
        aria-label={railName("Settings")}
        title={railName("Settings")}
      >
        <Icon name="settings" size={14} />
        <span className="sb-label">Settings</span>
      </Link>
      {footer}
    </aside>
  );
}
