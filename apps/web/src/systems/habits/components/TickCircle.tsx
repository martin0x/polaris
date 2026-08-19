"use client";

import { useRef, useState } from "react";

export type TickState = "off" | "partial" | "complete";

const HOLD_MS = 450; // keep in sync with --dur-hold in globals.css

interface TickCircleProps {
  state: TickState;
  disabled?: boolean;
  label: string;
  onChange: (next: TickState) => void;
}

export function TickCircle({ state, disabled, label, onChange }: TickCircleProps) {
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const firedHold = useRef(false);
  const pressed = useRef(false);
  const pressStart = useRef(0);

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHolding(false);
    pressed.current = false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    pressed.current = true;
    pressStart.current = Date.now();
    e.preventDefault();
    firedHold.current = false;
    if (state !== "complete") {
      setHolding(true);
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        firedHold.current = true;
        setHolding(false);
        onChange("complete");
      }, HOLD_MS);
    }
  };

  const onPointerUp = () => {
    if (disabled || !pressed.current) return;
    pressed.current = false;
    const wasHolding = holdTimer.current !== null;
    clearHold();
    if (firedHold.current) return; // the hold already completed this press
    if (state === "complete" && Date.now() - pressStart.current >= HOLD_MS) return; // hold on complete does nothing
    if (state === "off" && wasHolding) onChange("partial");
    else if (state !== "off") onChange("off");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    onChange(state === "off" ? "partial" : state === "partial" ? "complete" : "off");
  };

  return (
    <button
      type="button"
      className={`tick tick-${state}${holding ? " tick-holding" : ""}`}
      disabled={disabled}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
        <circle className="tick-ring" cx="11" cy="11" r="9" />
        {holding && <circle className="tick-hold-ring" cx="11" cy="11" r="9" />}
        {state === "partial" && <path className="tick-half" d="M2.5 11a8.5 8.5 0 0 0 17 0Z" />}
        {state === "complete" && (
          <>
            <circle className="tick-disc" cx="11" cy="11" r="8.5" />
            <path className="tick-check" d="m7.2 11.4 2.6 2.6 5-5.4" />
          </>
        )}
      </svg>
    </button>
  );
}
