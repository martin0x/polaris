"use client";

import { Icon } from "@/app/_components/Icon";

interface RowMenuProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onArchive: () => void;
}

export function RowMenu({ canMoveUp, canMoveDown, onRename, onMoveUp, onMoveDown, onArchive }: RowMenuProps) {
  const close = (e: React.MouseEvent) => {
    const details = (e.currentTarget as HTMLElement).closest("details");
    if (details) details.open = false;
  };
  return (
    <details className="habit-menu">
      <summary className="habit-menu-btn" aria-label="Habit actions">
        <Icon name="more-horizontal" size={14} />
      </summary>
      <div className="habit-menu-list" onClick={close}>
        <button type="button" onClick={onRename}>Rename</button>
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp}>Move up</button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown}>Move down</button>
        <button type="button" onClick={onArchive}>Archive</button>
      </div>
    </details>
  );
}
