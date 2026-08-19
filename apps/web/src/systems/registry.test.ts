import { describe, it, expect } from "vitest";
import { createSystemRegistry } from "./registry";
import { SystemManifest } from "./types";
import { NextResponse } from "next/server";

const mockHandler = async () => NextResponse.json({ ok: true });

const mockManifest: SystemManifest = {
  name: "test-system",
  displayName: "Test System",
  description: "A test system",
  routes: {
    "GET /items": mockHandler,
    "POST /items": mockHandler,
    "GET /items/:id": mockHandler,
  },
  nav: {
    label: "Test",
    icon: "beaker",
    href: "/test",
  },
};

describe("SystemRegistry", () => {
  it("finds a system by name", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.get("test-system")).toBe(mockManifest);
  });

  it("returns undefined for unknown system", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists all registered systems", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.list()).toEqual([mockManifest]);
  });

  it("returns navigation items for all systems", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.navItems()).toEqual([
      { label: "Test", icon: "beaker", href: "/test" },
    ]);
  });
});
