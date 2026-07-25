import { SystemManifest } from "./types";
import { manifest as journalManifest } from "./journal/manifest";
import { manifest as expensesManifest } from "./expenses/manifest";
import { manifest as habitsManifest } from "./habits/manifest";

export const manifests: SystemManifest[] = [
  journalManifest,
  expensesManifest,
  habitsManifest,
];
