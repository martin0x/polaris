"use client";

import { useRef, useState } from "react";
import { parsePesoInput } from "../lib/money";

interface ItemComposerProps {
  onAdd: (name: string, amountCentavos: number) => void;
}

export function ItemComposer({ onAdd }: ItemComposerProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [invalidPrice, setInvalidPrice] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (name.trim()) priceRef.current?.focus();
    }
  }

  function submit() {
    const centavos = parsePesoInput(price);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    if (centavos === null) {
      setInvalidPrice(true);
      priceRef.current?.focus();
      return;
    }
    onAdd(name.trim(), centavos);
    setName("");
    setPrice("");
    setInvalidPrice(false);
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
        data-invalid={invalidPrice}
        onChange={(e) => {
          setPrice(e.target.value);
          if (invalidPrice) setInvalidPrice(false);
        }}
      />
      <button type="submit" className="btn btn-primary" aria-label="Add item">
        Add
      </button>
    </form>
  );
}
