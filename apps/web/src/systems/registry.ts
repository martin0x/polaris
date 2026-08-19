import { SystemManifest } from "./types";

export function createSystemRegistry(manifests: SystemManifest[]) {
  const byName = new Map(manifests.map((m) => [m.name, m]));

  return {
    get(name: string): SystemManifest | undefined {
      return byName.get(name);
    },

    list(): SystemManifest[] {
      return manifests;
    },

    navItems() {
      return manifests.map((m) => m.nav);
    },
  };
}
