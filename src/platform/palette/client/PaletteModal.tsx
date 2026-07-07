"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/app/_components/Icon";
import type { MatchedSystem, PaletteResultWithMeta } from "../types";
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
  const emptyQuery = query.trim() === "";

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

  // Keep the selected row visible while arrowing through a scrolled list.
  useEffect(() => {
    document
      .getElementById(`palette-option-${selectedIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, results, matchedSystems]);

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

  const activate = useCallback(
    (sel: SelectableItem) => {
      if (sel.kind === "system") navigate(sel.system.href);
      else navigate(sel.result.href);
    },
    [navigate]
  );

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
        activate(sel);
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
      activate,
    ]
  );

  const placeholder = currentScope
    ? `Search ${currentScope.layerName} in ${currentScope.parentLabel}…`
    : "Search systems and entities…";

  const noResults = !loading && !emptyQuery && selectable.length === 0;
  const scopedIdle =
    !loading && emptyQuery && !!currentScope && selectable.length === 0;

  const systemItems = selectable.filter(
    (s): s is { kind: "system"; system: MatchedSystem } => s.kind === "system"
  );
  const resultItems = selectable.filter(
    (s): s is { kind: "result"; result: PaletteResultWithMeta } =>
      s.kind === "result"
  );

  function row(index: number, sel: SelectableItem) {
    const selected = index === selectedIndex;
    const icon: IconName | undefined =
      sel.kind === "system" ? (sel.system.icon as IconName | undefined) : sel.result.icon;
    const drills =
      sel.kind === "system"
        ? sel.system.layers.length > 0
        : sel.result.drillable === true;
    return (
      <li
        key={sel.kind === "system" ? `sys-${sel.system.name}` : `res-${sel.result.id}`}
        id={`palette-option-${index}`}
        role="option"
        className={`palette-row${selected ? " selected" : ""}`}
        aria-selected={selected}
        onMouseMove={() => {
          if (selectedIndex !== index) setSelectedIndex(index);
        }}
        onClick={() => activate(sel)}
      >
        {icon ? <Icon name={icon} size={14} /> : <span />}
        <div className="palette-main">
          <div className="lbl">
            {sel.kind === "system" ? sel.system.displayName : sel.result.label}
          </div>
          {sel.kind === "result" && sel.result.sublabel ? (
            <div className="sublabel">{sel.result.sublabel}</div>
          ) : null}
        </div>
        <div className="palette-side">
          {sel.kind === "system" && sel.system.layers.length > 0 ? (
            <span className="meta">
              {sel.system.layers.map((l) => l.name).join(" › ")}
            </span>
          ) : null}
          {sel.kind === "result" && !currentScope ? (
            <span className="meta">
              {sel.result.systemDisplayName} · {sel.result.layerName}
            </span>
          ) : null}
          {selected ? (
            <span className="palette-keys">
              {drills ? <kbd>⇥</kbd> : null}
              <kbd>↵</kbd>
            </span>
          ) : null}
        </div>
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
        {scopeStack.length > 0 ? (
          <div className="palette-scope">
            <span className="palette-scope-arrow" aria-hidden="true">
              →
            </span>
            {scopeStack.map((s, i) => {
              const deep = i === scopeStack.length - 1;
              return (
                <Fragment key={`${s.systemName}-${s.layerIndex}-${i}`}>
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  {deep ? (
                    <span className="palette-scope-seg deep">
                      {s.parentLabel}
                      <kbd
                        className={`palette-pop-key${emptyQuery ? " on" : ""}`}
                        aria-hidden={!emptyQuery}
                      >
                        ⌫
                      </kbd>
                    </span>
                  ) : (
                    <span className="palette-scope-seg">{s.parentLabel}</span>
                  )}
                </Fragment>
              );
            })}
          </div>
        ) : null}
        <div className="palette-search">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Command palette input"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={
              selectable.length > 0 ? `palette-option-${selectedIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <span
            className={`palette-load-dot${loading ? " on" : ""}`}
            aria-hidden="true"
          />
          <kbd className="palette-esc">esc</kbd>
        </div>
        {selectable.length > 0 ? (
          <ul className="palette-results" id="palette-listbox" role="listbox">
            {systemItems.length > 0 ? (
              <>
                <li className="palette-group-header" aria-hidden="true">
                  Systems
                </li>
                {systemItems.map((s, i) => row(i, s))}
                {resultItems.length > 0 ? (
                  <li className="palette-divider" role="separator" />
                ) : null}
              </>
            ) : null}
            {resultItems.map((r, i) => row(systemItems.length + i, r))}
          </ul>
        ) : null}
        {noResults ? (
          <p className="palette-empty">
            {currentScope
              ? `No matching ${currentScope.layerName}.`
              : "No matches in any system."}
          </p>
        ) : null}
        {scopedIdle && currentScope ? (
          <p className="palette-empty">
            {`Search ${currentScope.layerName} in ${currentScope.parentLabel}.`}
          </p>
        ) : null}
        {!currentScope && emptyQuery ? (
          <p className="palette-hint">
            Type to search systems and entities · Tab to drill in · Enter to
            open.
          </p>
        ) : null}
      </div>
    </div>
  );
}
