"use client";

import { useState } from "react";
import { formatCentavos, parsePesoInput } from "../lib/money";

export interface CaptureItem {
  id: string;
  name: string;
  amountCentavos: number;
  position: number;
}

interface ItemRowProps {
  item: CaptureItem;
  onEdit: (id: string, name: string, amountCentavos: number) => void;
  onDelete: (id: string) => void;
}

export function ItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState((item.amountCentavos / 100).toFixed(2));
  const [invalid, setInvalid] = useState(false);

  function save() {
    const centavos = parsePesoInput(price);
    if (!name.trim() || centavos === null) {
      setInvalid(true);
      return;
    }
    onEdit(item.id, name.trim(), centavos);
    setEditing(false);
    setInvalid(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="exp-row"
        style={{ width: "100%", border: "none", background: "none", font: "inherit", textAlign: "left", cursor: "pointer" }}
        onClick={() => {
          setName(item.name);
          setPrice((item.amountCentavos / 100).toFixed(2));
          setEditing(true);
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </span>
        <span className="amount">{formatCentavos(item.amountCentavos)}</span>
      </button>
    );
  }

  return (
    <div className="exp-row" style={{ flexWrap: "wrap" }}>
      <input
        type="text"
        value={name}
        aria-label="Item name"
        style={{ flex: "1 1 50%", minWidth: 0, padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit" }}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="text"
        inputMode="decimal"
        value={price}
        aria-label="Price in pesos"
        data-invalid={invalid}
        style={{ flex: "0 1 90px", padding: "var(--sp-1) var(--sp-2)", border: invalid ? "1px solid var(--danger)" : "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", fontFamily: "var(--font-mono)", textAlign: "right" }}
        onChange={(e) => {
          setPrice(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
      <button type="button" className="btn btn-secondary" onClick={save}>
        Save
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          if (window.confirm(`Delete "${item.name}"?`)) onDelete(item.id);
        }}
      >
        Delete
      </button>
    </div>
  );
}
