import { SystemManifest } from "./types";
import { manifest as journalManifest } from "./journal/manifest";
import { manifest as expensesManifest } from "./expenses/manifest";

export const manifests: SystemManifest[] = [
  journalManifest,
  expensesManifest,
];
