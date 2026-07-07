import { PolarisGlyph } from "./PolarisGlyph";
import { SidebarToggle } from "./SidebarChrome";
import { PaletteTrigger } from "./PaletteTrigger";

// 36px app chrome — traffic lights, glyph, breadcrumbs, sync dot.
export function TitleBar({
  crumbs,
  syncState = "ok",
  email,
}: {
  /** Plain strings or client islands (e.g. SystemCrumb) — each renders as one crumb. */
  crumbs: React.ReactNode[];
  syncState?: "ok" | "offline";
  email?: string | null;
}) {
  return (
    <header className="titlebar">
      <SidebarToggle />
      <span style={{ display: "inline-flex" }}>
        <PolarisGlyph size={14} />
      </span>
      <span
        className="tb-wordmark"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 13,
          color: "var(--ink-1)",
          fontWeight: 500,
        }}
      >
        Polaris
      </span>
      <span
        className="tb-wordmark"
        style={{
          width: 1,
          height: 14,
          background: "var(--border)",
          margin: "0 6px",
        }}
      />
      <div className="crumbs">
        {crumbs.map((p, i) => (
          <span
            key={i}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span className={i === crumbs.length - 1 ? "cur" : undefined}>
              {p}
            </span>
            {i < crumbs.length - 1 && <span className="sep">›</span>}
          </span>
        ))}
      </div>
      <div className="titlebar-right">
        <PaletteTrigger />
        <span
          className="sync-dot"
          style={{
            background:
              syncState === "ok" ? "var(--success)" : "var(--warning)",
          }}
        />
        <span className="sync-label">
          {syncState === "ok" ? "synced" : "offline"}
        </span>
        {email && (
          <>
            <span
              className="tb-email"
              style={{
                width: 1,
                height: 14,
                background: "var(--border)",
                margin: "0 4px",
              }}
            />
            <span
              className="tb-email"
              style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
            >
              {email}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
