import { SystemManifest } from "./types";
import { manifest as journalManifest } from "./journal/manifest";

export const manifests: SystemManifest[] = [
  journalManifest,
];
