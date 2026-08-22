"use client";

import { useRef, useState } from "react";
import { validatePesoInput } from "@polaris/core/money";

interface ItemComposerProps {
  onAdd: (name: string, amountCentavos: number) => void;
}

export function ItemComposer({ onAdd }: ItemComposerProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const validation = validatePesoInput(price);
  const invalid = (price.trim() !== "" && !validation.ok) || (submitted && !validation.ok);

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (name.trim()) priceRef.current?.focus();
    }
  }

  function submit() {
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    if (!validation.ok) {
      setSubmitted(true);
      priceRef.current?.focus();
      return;
    }
    onAdd(name.trim(), validation.centavos);
    setName("");
    setPrice("");
    setSubmitted(false);
    nameRef.current?.focus();
  }

  return (
    <form
      className="exp-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={nameRef}
        className="exp-name"
        type="text"
        value={name}
        placeholder="Item"
        aria-label="Item name"
        enterKeyHint="next"
        autoComplete="off"
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleNameKeyDown}
      />
      <input
        ref={priceRef}
        className="exp-price"
        type="text"
        inputMode="decimal"
        value={price}
        placeholder="0.00"
        aria-label="Price in pesos"
        enterKeyHint="done"
        autoComplete="off"
        data-invalid={invalid}
        aria-invalid={invalid || undefined}
        title={!validation.ok && validation.reason === "max" ? "Amounts go up to ₱1,000,000.00" : undefined}
        onChange={(e) => {
          setPrice(e.target.value);
          setSubmitted(false);
        }}
      />
      <button type="submit" className="btn btn-primary" aria-label="Add item">
        Add
      </button>
    </form>
  );
}
