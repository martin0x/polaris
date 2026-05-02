"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/app/_components/Icon";
import type {
  MatchedSystem,
  PaletteResultWithMeta,
} from "../types";
import type { PaletteScopeFrame } from "./PaletteProvider";

interface PaletteModalProps {
  onClose: () => void;
}

interface PaletteResponse {
  results: PaletteResultWithMeta[];
  matchedSystems?: MatchedSystem[];
}

type SelectableItem =
  | { kind: "system"; system: MatchedSystem }
  | { kind: "result"; result: PaletteResultWithMeta };

const DEBOUNCE_MS = 150;

export function PaletteModal({ onClose }: PaletteModalProps) {
  const [query, setQuery] = useState("");
  const [scopeStack, setScopeStack] = useState<PaletteScopeFrame[]>([]);
  const [results, setResults] = useState<PaletteResultWithMeta[]>([]);
  const [matchedSystems, setMatchedSystems] = useState<MatchedSystem[] | undefined>(undefined);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cache of all palette-bearing systems' layer metadata. Populated on mount
  // and used for Tab-drill lookups even when the current scoped response no
  // longer contains matchedSystems.
  const systemsCatalogRef = useRef<Map<string, MatchedSystem>>(new Map());

  const currentScope = scopeStack[scopeStack.length - 1];

  const selectable = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    if (!currentScope && matchedSystems) {
      for (const s of matchedSystems) items.push({ kind: "system", system: s });
    }
    for (const r of results) items.push({ kind: "result", result: r });
    return items;
  }, [matchedSystems, results, currentScope]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // One-shot catalog fetch on mount. Independent of the debounced query
  // fetch so the catalog is populated even if the user types fast and the
  // first debounced response carries a substring-filtered matchedSystems.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/palette/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "" }),
    })
      .then((r) => r.json() as Promise<PaletteResponse>)
      .then((j) => {
        if (cancelled || !j.matchedSystems) return;
        for (const s of j.matchedSystems) {
          systemsCatalogRef.current.set(s.name, s);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced fetch on query/scope change.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const body = currentScope
          ? {
              query,
              scope: {
                systemName: currentScope.systemName,
                layerIndex: currentScope.layerIndex,
                parentId: currentScope.parentId,
              },
            }
          : { query };
        const res = await fetch("/api/platform/palette/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json: PaletteResponse = await res.json();
        if (cancelled) return;
        setResults(json.results ?? []);
        setMatchedSystems(json.matchedSystems);
        setSelectedIndex(0);
        if (json.matchedSystems) {
          for (const s of json.matchedSystems) {
            systemsCatalogRef.current.set(s.name, s);
          }
        }
      } catch {
        // Network error — keep prior list (no flash of empty per spec).
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, currentScope]);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const pushSystemScope = useCallback((system: MatchedSystem) => {
    if (system.layers.length === 0) return;
    const firstLayer = system.layers[0];
    setScopeStack((s) => [
      ...s,
      {
        systemName: system.name,
        systemDisplayName: system.displayName,
        layerIndex: 0,
        layerName: firstLayer.name,
        parentId: null,
        parentLabel: system.displayName,
      },
    ]);
    setQuery("");
  }, []);

  const pushDrillScope = useCallback((result: PaletteResultWithMeta) => {
    if (!result.drillable) return;
    const sys = systemsCatalogRef.current.get(result.systemName);
    if (!sys) return;
    const nextIndex = result.layerIndex + 1;
    const nextLayer = sys.layers[nextIndex];
    if (!nextLayer) return;
    setScopeStack((s) => [
      ...s,
      {
        systemName: result.systemName,
        systemDisplayName: result.systemDisplayName,
        layerIndex: nextIndex,
        layerName: nextLayer.name,
        parentId: result.id,
        parentLabel: result.label,
      },
    ]);
    setQuery("");
  }, []);

  const popScope = useCallback(() => {
    setScopeStack((s) => s.slice(0, -1));
    setQuery("");
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(i + 1, Math.max(0, selectable.length - 1))
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Backspace" && query === "" && scopeStack.length > 0) {
        e.preventDefault();
        popScope();
        return;
      }
      const sel = selectable[selectedIndex];
      if (!sel) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (sel.kind === "system") {
          pushSystemScope(sel.system);
        } else {
          navigate(sel.result.href);
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (sel.kind === "system") {
          pushSystemScope(sel.system);
        } else {
          pushDrillScope(sel.result);
        }
        return;
      }
    },
    [
      selectable,
      selectedIndex,
      query,
      scopeStack.length,
      onClose,
      popScope,
      pushSystemScope,
      pushDrillScope,
      navigate,
    ]
  );

  const placeholder = !currentScope
    ? "Type to search systems and entities · Tab to drill in · Enter to open."
    : `Search ${currentScope.layerName} in ${currentScope.systemDisplayName}.`;

  const breadcrumb =
    scopeStack.length === 0
      ? null
      : "→ " + scopeStack.map((s) => s.parentLabel).join(" · ") + " ·";

  const noResults =
    !loading &&
    selectable.length === 0 &&
    query.length > 0 &&
    !(matchedSystems && matchedSystems.length > 0);

  const systemItems = selectable.filter(
    (s): s is { kind: "system"; system: MatchedSystem } => s.kind === "system"
  );
  const resultItems = selectable.filter(
    (s): s is { kind: "result"; result: PaletteResultWithMeta } => s.kind === "result"
  );

  function rowFor(index: number, kind: "system" | "result", node: React.ReactNode) {
    return (
      <li
        key={`${kind}-${index}`}
        role="option"
        className={`palette-row${index === selectedIndex ? " selected" : ""}`}
        aria-selected={index === selectedIndex}
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => {
          const sel = selectable[index];
          if (!sel) return;
          if (sel.kind === "system") pushSystemScope(sel.system);
          else navigate(sel.result.href);
        }}
      >
        {node}
      </li>
    );
  }

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette-modal">
        {breadcrumb ? (
          <div className="palette-breadcrumb">{breadcrumb}</div>
        ) : null}
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Command palette input"
        />
        {selectable.length === 0 && query === "" && !loading ? (
          <p className="palette-empty">{placeholder}</p>
        ) : null}
        {noResults ? (
          <p className="palette-empty">
            {currentScope
              ? `No matching ${currentScope.layerName}.`
              : "No matches in any system."}
          </p>
        ) : null}
        {selectable.length > 0 ? (
          <ul className="palette-results" role="listbox">
            {systemItems.length > 0 ? (
              <>
                <li className="palette-group-header">Systems</li>
                {systemItems.map((s, i) =>
                  rowFor(
                    i,
                    "system",
                    <>
                      {s.system.icon ? (
                        <Icon name={s.system.icon as IconName} />
                      ) : (
                        <span />
                      )}
                      <div>
                        <div className="lbl">{s.system.displayName}</div>
                        <div className="sublabel">{s.system.name}</div>
                      </div>
                      <span className="meta">↹</span>
                    </>
                  )
                )}
                {resultItems.length > 0 ? <li className="palette-divider" /> : null}
              </>
            ) : null}
            {resultItems.map((r, i) => {
              const idx = systemItems.length + i;
              return rowFor(
                idx,
                "result",
                <>
                  {r.result.icon ? <Icon name={r.result.icon} /> : <span />}
                  <div>
                    <div className="lbl">{r.result.label}</div>
                    {r.result.sublabel ? (
                      <div className="sublabel">{r.result.sublabel}</div>
                    ) : null}
                  </div>
                  <span className="meta">
                    {r.result.systemDisplayName} · {r.result.layerName}
                  </span>
                </>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
