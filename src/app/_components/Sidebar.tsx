"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

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
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <button className="sb-search" type="button" aria-label="Search or jump to">
        <Icon name="search" size={14} />
        <span>Search or jump to…</span>
        <span className="k">⌘K</span>
      </button>

      <Link
        href="/dashboard"
        className={`sb-item${isActive("/dashboard") ? " active" : ""}`}
      >
        <Icon name="compass" size={14} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          Today
        </span>
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
          >
            <Icon name={item.icon} size={14} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </span>
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
      >
        <Icon name="settings" size={14} />
        <span>Settings</span>
      </Link>
      {footer}
    </aside>
  );
}
