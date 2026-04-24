import { PolarisGlyph } from "./PolarisGlyph";

// 36px app chrome — traffic lights, glyph, breadcrumbs, sync dot.
export function TitleBar({
  crumbs,
  syncState = "ok",
  email,
}: {
  crumbs: string[];
  syncState?: "ok" | "offline";
  email?: string | null;
}) {
  return (
    <header className="titlebar">
      <span style={{ display: "inline-flex" }}>
        <PolarisGlyph size={14} />
      </span>
      <span
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
            key={`${p}-${i}`}
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
        <span
          className="sync-dot"
          style={{
            background:
              syncState === "ok" ? "var(--success)" : "var(--warning)",
          }}
        />
        <span>{syncState === "ok" ? "synced" : "offline"}</span>
        {email && (
          <>
            <span
              style={{
                width: 1,
                height: 14,
                background: "var(--border)",
                margin: "0 4px",
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {email}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
