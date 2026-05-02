"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useGlobalKeybinding } from "./useGlobalKeybinding";
import { PaletteModal } from "./PaletteModal";

export interface PaletteScopeFrame {
  systemName: string;
  systemDisplayName: string;
  layerIndex: number;
  layerName: string;
  parentId: string | null;
  parentLabel: string;
}

interface PaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<PaletteContextValue | null>(null);

export function usePalette(): PaletteContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePalette must be used inside <PaletteProvider>");
  return v;
}

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((s) => !s), []);

  useGlobalKeybinding(toggle);

  const value = useMemo(() => ({ open, close, toggle }), [open, close, toggle]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen ? <PaletteModal onClose={close} /> : null}
    </Ctx.Provider>
  );
}
