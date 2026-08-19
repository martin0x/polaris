"use client";

import { useEffect } from "react";

export function HashAnchorScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#entry-")) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("flash");
    const t = setTimeout(() => target.classList.remove("flash"), 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}
